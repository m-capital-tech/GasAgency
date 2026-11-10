from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "Commercial LPG Platform Client Guide.docx"
doc = Document()
section = doc.sections[0]
section.page_width = Inches(8.5)
section.page_height = Inches(11)
section.top_margin = Inches(0.7)
section.bottom_margin = Inches(0.65)
section.left_margin = Inches(0.8)
section.right_margin = Inches(0.8)
section.footer_distance = Inches(0.3)

for name in ["Normal", "Title", "Subtitle", "Heading 1", "Heading 2", "List Bullet", "List Number"]:
    style = doc.styles[name]
    style.font.name = "Calibri"
    style.font.color.rgb = RGBColor(0, 0, 0)
    style.element.get_or_add_rPr().rFonts.set(qn("w:ascii"), "Calibri")
    style.element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), "Calibri")

for style in doc.styles:
    for border in list(style.element.iter(qn("w:pBdr"))):
        border.getparent().remove(border)

doc.styles["Subtitle"].font.italic = False

normal = doc.styles["Normal"]
normal.font.size = Pt(11)
normal.paragraph_format.space_after = Pt(7)
normal.paragraph_format.line_spacing = 1.12
doc.styles["Title"].font.size = Pt(27)
doc.styles["Title"].font.bold = True
doc.styles["Title"].paragraph_format.space_after = Pt(9)
doc.styles["Subtitle"].font.size = Pt(13)
doc.styles["Subtitle"].paragraph_format.space_after = Pt(12)
for name, size in [("Heading 1", 20), ("Heading 2", 12)]:
    doc.styles[name].font.size = Pt(size)
    doc.styles[name].font.bold = True
    doc.styles[name].paragraph_format.space_before = Pt(12 if name == "Heading 2" else 0)
    doc.styles[name].paragraph_format.space_after = Pt(6)
    doc.styles[name].paragraph_format.keep_with_next = True
for name in ["List Bullet", "List Number"]:
    doc.styles[name].paragraph_format.space_after = Pt(6)
    doc.styles[name].paragraph_format.line_spacing = 1.08

numbering = doc.part.numbering_part.element
abstract_id = max(int(n.get(qn("w:abstractNumId"))) for n in numbering.findall(qn("w:abstractNum"))) + 1
number_id = max(int(n.get(qn("w:numId"))) for n in numbering.findall(qn("w:num"))) + 1
abstract = OxmlElement("w:abstractNum")
abstract.set(qn("w:abstractNumId"), str(abstract_id))
level = OxmlElement("w:lvl")
level.set(qn("w:ilvl"), "0")
for tag, value in [("start", "1"), ("numFmt", "bullet"), ("lvlText", "•"), ("lvlJc", "left")]:
    element = OxmlElement("w:" + tag)
    element.set(qn("w:val"), value)
    level.append(element)
abstract.append(level)
numbering.append(abstract)
number = OxmlElement("w:num")
number.set(qn("w:numId"), str(number_id))
abstract_reference = OxmlElement("w:abstractNumId")
abstract_reference.set(qn("w:val"), str(abstract_id))
number.append(abstract_reference)
numbering.append(number)

footer = section.footer.paragraphs[0]
footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
run = footer.add_run("Munna Gas Connect  |  ")
run.font.size = Pt(9)
field = OxmlElement("w:fldSimple")
field.set(qn("w:instr"), "PAGE")
footer._p.append(field)


def paragraph(text, style=None):
    return doc.add_paragraph(text, style)


def bullet(lead, text):
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.left_indent = Inches(0.25)
    p.paragraph_format.first_line_indent = Inches(-0.25)
    num_props = p._p.get_or_add_pPr().get_or_add_numPr()
    num_props.get_or_add_ilvl().val = 0
    num_props.get_or_add_numId().val = number_id
    p.add_run(lead + ". ").bold = True
    p.add_run(text)
    return p


def heading(text):
    doc.add_heading(text, level=2)


def feature(lead, text):
    p = doc.add_paragraph()
    p.add_run(lead + ". ").bold = True
    p.add_run(text)


def page(title):
    heading_paragraph = doc.add_heading(title, level=1)
    heading_paragraph.paragraph_format.page_break_before = True


def table(headers, rows, widths):
    t = doc.add_table(rows=1, cols=len(headers))
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    for col, width in zip(t.columns, widths):
        col.width = Inches(width)
    props = t._tbl.tblPr
    borders = OxmlElement("w:tblBorders")
    for edge in ["top", "left", "bottom", "right", "insideH", "insideV"]:
        border = OxmlElement("w:" + edge)
        for k, v in {"val": "single", "sz": "4", "color": "D9D9D9"}.items():
            border.set(qn("w:" + k), v)
        borders.append(border)
    props.append(borders)
    margins = OxmlElement("w:tblCellMar")
    for edge in ["top", "left", "bottom", "right"]:
        e = OxmlElement("w:" + edge)
        e.set(qn("w:w"), "110")
        e.set(qn("w:type"), "dxa")
        margins.append(e)
    props.append(margins)
    repeat = OxmlElement("w:tblHeader")
    t.rows[0]._tr.get_or_add_trPr().append(repeat)

    def fill_row(row, values, is_header=False, shaded=False):
        no_split = OxmlElement("w:cantSplit")
        row._tr.get_or_add_trPr().append(no_split)
        for cell, value, width in zip(row.cells, values, widths):
            cell.width = Inches(width)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            if is_header or shaded:
                shading = OxmlElement("w:shd")
                shading.set(qn("w:fill"), "243746" if is_header else "F3F6F8")
                cell._tc.get_or_add_tcPr().append(shading)
            p = cell.paragraphs[0]
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.06
            r = p.add_run(value)
            r.font.size = Pt(10.5)
            if is_header:
                r.bold = True
                r.font.color.rgb = RGBColor(255, 255, 255)

    fill_row(t.rows[0], headers, is_header=True)
    for index, row in enumerate(rows):
        fill_row(t.add_row(), row, shaded=index % 2 == 1)
    doc.add_paragraph().paragraph_format.space_after = Pt(0)
    return t


doc.add_paragraph("Munna Gas Connect Client Guide", "Title")
doc.add_paragraph("App features and dashboard workflows", "Subtitle")
paragraph("10 November 2026")
paragraph(
    "The platform connects restaurants, hotels, and other commercial businesses with their assigned LPG supply agencies. "
    "Businesses use the mobile app to order cylinders and view deliveries and bills. Platform staff manage registration and approvals, "
    "while agencies manage fulfilment and collections through their dashboards."
)
paragraph(
    "This guide explains who uses each part of the platform, what each dashboard does, and how an order moves through the system. "
    "The final page distinguishes the current core build from features and service connections still being completed."
)
heading("Who uses the platform")
table(
    ["User", "Main responsibility", "Access point"],
    [
        ("Super Admin", "Company oversight, governance and exceptional decisions", "Platform Control executive command centre"),
        ("Platform Admin", "Approve businesses and control access and credit", "Platform Control dashboard"),
        ("Platform team", "Register businesses and carry out permitted operations", "Platform Control dashboard"),
        ("Agency team", "Deliver orders and manage commercial accounts", "Agency Operations dashboard"),
        ("Tenant", "Order LPG and manage the business account", "Tenant mobile app"),
    ],
    [1.25, 3.35, 2.3],
)
paragraph(
    "A tenant means a business account, such as a restaurant or hotel. An outlet is a delivery location belonging to that business. "
    "One business may have several outlets, and one person may have access to more than one business."
)
heading("How the parts work together")
paragraph(
    "The app and dashboards use a shared platform record. An approved business becomes eligible to order. Its orders appear in the assigned agency's queue. "
    "Agency delivery actions update the order timeline, stock, and invoices. Recorded collections update the balance visible to the agency and business. "
    "Platform administrators see the records and totals allowed by their role and operating area."
)

page("Business registration and first login")
paragraph(
    "Registration starts with the platform team. Businesses do not create their own accounts in the production app. "
    "A Platform Admin verifies and approves the registration before the business becomes active."
)
heading("Information collected during registration")
bullet("Business details", "Business name, business type, mandatory GSTIN, and optional FSSAI information.")
bullet("Contact details", "Owner or contact name and the mobile number that will be used to sign in.")
bullet("Delivery address", "Outlet name, full address, city, state, pincode, and location coordinates.")
bullet("LPG requirement", "19 kg and/or 47.5 kg cylinders, expected quantity per week or month, cylinders in use, full spares, and empties.")
bullet("Serving agency", "An authorized platform operator explicitly selects an approved agency. The system does not automatically choose one.")
bullet("Commercial terms", "The proposed account payment arrangement and, if requested, the proposed credit limit and repayment period.")
heading("Approval process")
for text in [
    "A permitted team member creates a business draft and submits it for review.",
    "The Platform Admin checks the GSTIN, contact, address, LPG requirement, selected agency, and proposed terms.",
    "The reviewer approves, rejects, or requests changes and records the reason. The creator cannot approve their own submission.",
    "Approval activates the business and commercial account. Credit is enabled only if separately approved; otherwise, the account proceeds without approved credit.",
    "The system queues the registration confirmation. The intended delivery order is SMS first and WhatsApp only as a fallback if SMS is not delivered.",
    "The business opens the app, enters its registered mobile number, and verifies a one-time password. If the person belongs to multiple businesses, they select the business to use.",
]:
    paragraph(text, "List Number")
paragraph(
    "Approval and messaging are separate steps: approval activates the account, while the invitation tells the contact how to access it. "
    "MessageIndia login OTP delivery is connected. Registration confirmations require their separately approved DLT template; WhatsApp remains a later fallback channel."
)

page("Tenant mobile app")
paragraph(
    "The tenant app is the business user's daily view of LPG supply. Access is limited to the selected business and its outlets. "
    "The current production path focuses on ordering, order status, credit visibility, and billing."
)
heading("Home and account")
feature("Registered business login", "Use the registered mobile number and a one-time password. A person with several business memberships can switch between them.")
feature("Outlet stock", "See cylinders in use, full spares, and empty cylinders for each outlet.")
feature("Agency and prices", "See the assigned serving agency and applicable cylinder prices, including account-specific negotiated prices.")
feature("Credit position", "See approved credit, the amount used, available credit, repayment terms, and warnings when overdue invoices prevent credit ordering.")
heading("Place an order")
paragraph(
    "The user selects an outlet, cylinder type and quantity, an available delivery slot, and an eligible payment method. "
    "The app obtains a quotation showing cylinder value, delivery or slot charges, GST, and the total. "
    "The platform checks the price and account eligibility again when the user confirms the order."
)
paragraph(
    "The current order methods are cash on delivery and approved account credit. Online payment checkout is a later integration. "
    "Credit ordering also depends on the agency allowing credit, no overdue invoices, and sufficient available limit."
)
heading("Track orders and deliveries")
bullet("Order history", "View previous orders and filter by status.")
bullet("Order timeline", "See recorded steps such as placed, accepted, assigned, out for delivery, delivered, or failed. Refresh to load the latest state.")
bullet("Delivery information", "View the assigned delivery partner and vehicle when available, the outlet address, quantities, empties collected, and the agency contact.")
heading("Bills and recorded payments")
paragraph(
    "The billing screen shows outstanding and overdue invoices, payments recorded in the last 30 days, and the credit account position. "
    "Users can view open, overdue, and paid invoices and open the GST invoice detail, including recorded payment allocations. "
    "Invoices are issued after completed deliveries."
)
paragraph(
    "Live map tracking, standing orders, full support-case workflows, consumption charts, and consolidated monthly statements are planned extensions."
)

page("Platform Control dashboard")
paragraph(
    "Platform Control is used by Platform Admins and their authorized team. Each user sees only the cities, regions, agencies, or records assigned to them. "
    "Permissions determine which information they can view and which actions they can perform."
)
heading("Overview")
paragraph(
    "The current overview shows business counts, active businesses, pending approvals, requested changes, pending credit decisions, "
    "and approvals beyond the configured review time. It also shows today's orders, order value and completed deliveries, "
    "weekly and monthly orders and order value, and open and overdue receivables. Reporting periods use Indian Standard Time."
)
heading("Register and review businesses")
paragraph(
    "The team can create and submit registrations, choose the serving agency, and capture the initial outlet and LPG requirement. "
    "The onboarding queue lets authorized reviewers filter by business status, open the complete registration, inspect the proposal, "
    "and approve, reject, or request changes with a reason. Review history remains attached to the business record."
)
heading("Manage business status and credit")
bullet("Business status", "Authorized administrators can suspend or reinstate a business. Suspension revokes affected access sessions and stops new activity.")
bullet("Credit decisions", "Approve credit, set or change the limit and repayment period, or suspend and reinstate credit. Standard terms are 7, 15, or 30 days.")
bullet("Decision history", "See the previous and new credit terms, the reason, the decision maker, and the date.")
heading("Team access and roles")
paragraph(
    "A Platform Admin can create team roles and invite members with an assigned operating scope. "
    "Role-based access control means each role contains specific permissions. An administrator cannot give another person permissions "
    "they do not hold, and ordinary team members cannot receive reserved tenant-approval or credit-approval authority. "
    "Privileged login uses phone verification plus an authenticator or recovery code."
)
heading("Additional dashboard work")
paragraph(
    "The current dashboard includes executive analytics, agency and tenant administration, onboarding, scoped team access, role management, credit governance, support indicators, and privileged audit activity. "
    "Further work remains for richer exports, automated executive report delivery, deeper service-health diagnostics, and production acceptance of every cross-role workflow."
)

page("Agency Operations dashboard")
paragraph(
    "The agency dashboard supports fulfilment and commercial account operations for the agencies the user is authorized to access. "
    "Its current main areas are Orders and Business Accounts."
)
heading("Orders and fulfilment")
bullet("Order queue", "View new and existing orders, filter by status, and open outlet, cylinder, payment, amount, and delivery details.")
bullet("Accept or reject", "Accept an order and reserve stock, or reject or cancel it with a reason.")
bullet("Assign and dispatch", "Select active delivery staff, view their vehicle and workload, assign the order, and dispatch the cylinders.")
bullet("Complete delivery", "Record returned empty cylinders by type. For cash-on-delivery orders, confirm cash collection before completing delivery and issuing the invoice.")
bullet("Handle delivery problems", "Record a failed delivery with a reason, then reschedule or cancel according to the available order actions.")
paragraph(
    "Inventory movements follow the fulfilment record: acceptance reserves cylinders, dispatch moves physical stock, "
    "and delivery or failure records the corresponding stock and cylinder-custody changes. "
    "The order view includes delivery capacity and inventory information."
)
heading("Business accounts and collections")
bullet("Account view", "See assigned commercial accounts, credit terms, receivables, overdue balances, and recorded collections.")
bullet("Negotiated prices", "Set or remove a lower account-specific cylinder price within the permitted catalogue ceiling, with a reason.")
bullet("Record a payment", "Record money received by bank transfer, UPI, cash, cheque, or another supported method, with a reference or note as applicable.")
bullet("Invoice allocation", "Recorded collections settle the oldest outstanding invoices first. Posted records are retained for the financial history.")
bullet("Agency credit switch", "Pause or resume new credit ordering across the agency. Existing invoices and their repayment obligations remain in place.")
heading("The credit authority boundary")
paragraph(
    "Agencies can record collections, negotiate prices, and control agency-wide credit availability. "
    "Only authorized platform administrators approve an individual business's credit, change its limit, or change its repayment period. "
    "A negotiated price does not increase the credit limit. Recording a payment does not change the agreed terms."
)
paragraph(
    "Dedicated agency staff administration, inventory adjustments, live tracking maps, complaints, subscriptions, and settings are part of the planned expansion. "
    "The separate delivery-partner mobile journey also needs production completion."
)

page("Super Admin and reporting boundaries")
paragraph(
    "The Super Admin is the executive role for the Founder, Chairman, Managing Director, or a specifically appointed equivalent. "
    "The live command centre provides platform-wide daily, weekly, and monthly analytics, revenue mix, support operations, onboarding, order state, agency performance, credit exposure, operational exceptions, service indicators, and privileged audit activity."
)
heading("Executive capabilities")
bullet("Oversight", "View platform-wide agency, business, order, payment, credit, inventory, support, and service-health information.")
bullet("Governance", "Control Platform Admin access, permission limits, platform rules, and exceptional actions with recorded reasons.")
bullet("Incident response", "Suspend affected accounts or workflows and review actions that require executive attention.")
bullet("Protected history", "Review privileged activity without deleting audit, order, or financial history. Accounts are named and protected with additional authentication.")
heading("Who should see which reports")
table(
    ["Audience", "Reporting boundary"],
    [
        ("Super Admin", "The whole platform, including executive performance and permitted financial risk information."),
        ("Platform Admin", "Operations within the assigned scope. Company ownership, board material, and confidential profitability are excluded by default."),
        ("Platform team", "Metrics needed for the person's role and assigned records, such as onboarding workload or collections."),
        ("Agency", "Its authorized agency operations, assigned accounts, deliveries, receivables, and collections."),
        ("Tenant", "Only its own businesses and outlets, orders, spend, invoices, credit, and service performance."),
    ],
    [1.45, 5.45],
)
heading("Daily weekly and monthly summaries")
bullet("Daily", "Orders and delivery progress, pending approvals, outstanding collections, service failures, and urgent exceptions.")
bullet("Weekly", "Trends in orders and cylinder demand, business activation, agency fulfilment, overdue accounts, and team turnaround.")
bullet("Monthly", "Growth, retention, revenue where available, credit position, collections, service performance, and progress against executive targets.")
paragraph(
    "Platform Control includes source-backed daily, weekly, and monthly totals plus clearly labelled run-rate projections. "
    "Richer comparisons, exports, and automated report delivery remain planned. "
    "Each report must respect the same access boundaries as the records behind it."
)

page("Current scope and release status")
paragraph(
    "The core workflows below are present in the current build. Customer rollout still depends on the remaining service connections, "
    "production setup, and complete end-to-end acceptance testing. A feature being built does not by itself mean the full customer journey is live."
)
table(
    ["Area", "Current position"],
    [
        ("Business onboarding", "Core registration, mandatory GSTIN, explicit agency selection, submission, approval, lifecycle, and credit decisions are built."),
        ("Platform team access", "Scoped roles, team invitations, server-enforced permissions, and privileged authentication are built."),
        ("Tenant app", "Core login flow, stock, pricing, quotations, COD or approved-credit orders, status history, invoices, and billing are built."),
        ("Agency operations", "Order fulfilment, inventory effects, account pricing, collections, and agency-wide credit controls are built."),
        ("Super Admin", "The authenticated executive command centre, global analytics, governance, and privileged audit visibility are live. Cross-role production acceptance remains."),
        ("App notifications", "The production worker, device registration, encrypted token storage, transactional events, retries, and tap routes are built. Physical-device acceptance remains."),
        ("App updates", "The permanent Expo project, production channel, signed Android bundle, and runtime 1.0.0 OTA are active. Play internal testing and device acceptance remain."),
        ("SMS and WhatsApp", "MessageIndia login OTP delivery is active. Registration and other SMS templates require their own DLT approvals; WhatsApp fallback is not yet connected."),
        ("Documents", "Private Spaces infrastructure exists, but application credentials, production activation, and upload/download acceptance remain pending."),
        ("Later features", "Online checkout, live delivery maps, automated report delivery, and other post-COD/credit enhancements remain later work."),
    ],
    [1.5, 5.4],
)
heading("Example of a shared account update")
paragraph(
    "A restaurant orders cylinders on approved credit. The order appears in its serving agency's queue. "
    "The agency accepts, assigns, dispatches, and records delivery. The restaurant sees the recorded order progress and resulting invoice. "
    "When the agency records an invoice payment, the shared balance and credit position update. "
    "The Platform Admin sees the permitted operational totals for that account and area."
)
paragraph(
    "The remaining release sequence is production document-storage activation, approved QA identity creation, cross-role end-to-end testing, "
    "Play internal testing, and physical-device verification of OTP, notifications, and OTA updates."
)

doc.core_properties.title = "Munna Gas Connect Client Guide"
doc.core_properties.subject = "Tenant app features dashboard responsibilities and shared workflows"
doc.core_properties.author = "Munna United Distributors Private Limited"
doc.core_properties.keywords = "commercial LPG, client guide, tenant app, dashboards"
doc.core_properties.comments = ""
doc.save(OUTPUT)
print(OUTPUT)
