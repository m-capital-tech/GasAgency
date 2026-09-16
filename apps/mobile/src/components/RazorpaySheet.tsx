import { Ionicons } from "@expo/vector-icons";
import { formatINR, type PaymentMethod, type PaymentOrder } from "@gassetu/shared";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { registerCheckoutSheet, resolveCheckout } from "@/lib/providers";
import { Button, Input, Text, t } from "@/ui";

type Tab = Exclude<PaymentMethod, "cod">;
const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "upi", label: "UPI", icon: "qr-code-outline" },
  { key: "card", label: "Card", icon: "card-outline" },
  { key: "netbanking", label: "Netbanking", icon: "business-outline" },
  { key: "wallet", label: "Wallet", icon: "wallet-outline" },
];
const UPI_APPS = ["GPay", "PhonePe", "Paytm", "BHIM"];
const BANKS = ["SBI", "HDFC Bank", "ICICI Bank", "Axis Bank", "Kotak", "Union Bank"];
const WALLETS = ["Paytm Wallet", "Amazon Pay", "Mobikwik", "Freecharge"];

/**
 * Mock Razorpay Checkout (PRD C9). Mounted once at the root; opened via `mockRazorpay.checkout()`.
 * Returns {razorpay_payment_id: "pay_mock_…"} on success, mirroring the real SDK's shape.
 */
export function RazorpaySheet() {
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [tab, setTab] = useState<Tab>("upi");
  const [choice, setChoice] = useState<string | null>("GPay");
  const [upiId, setUpiId] = useState("");
  const [phase, setPhase] = useState<"form" | "processing">("form");

  useEffect(() => {
    registerCheckoutSheet((o, prefer) => {
      setOrder(o);
      setTab((prefer as Tab) && prefer !== "cod" ? (prefer as Tab) : "upi");
      setChoice("GPay");
      setPhase("form");
    });
    return () => registerCheckoutSheet(null);
  }, []);

  const finish = (ok: boolean) => {
    if (!order) return;
    setPhase("processing");
    setTimeout(() => {
      setOrder(null);
      setPhase("form");
      resolveCheckout(
        ok
          ? { ok: true, razorpay_payment_id: `pay_mock_${Math.random().toString(36).slice(2, 12)}`, razorpay_order_id: order.orderId, razorpay_signature: "sig_mock", method: tab }
          : { ok: false, error: { code: "BAD_REQUEST_ERROR", description: "Payment failed: bank declined the transaction (test)." } },
      );
    }, 1400);
  };
  const cancel = () => {
    setOrder(null);
    resolveCheckout({ ok: false, error: { code: "CANCELLED", description: "Payment cancelled" } });
  };

  const Option = ({ label, icon }: { label: string; icon?: keyof typeof Ionicons.glyphMap }) => (
    <Pressable onPress={() => setChoice(label)} accessibilityRole="radio" accessibilityState={{ selected: choice === label }} style={[styles.option, choice === label && styles.optionActive]}>
      <View style={styles.optionIcon}>
        <Ionicons name={icon ?? "ellipse-outline"} size={16} color={t.colors.ink} />
      </View>
      <Text variant="bodyStrong" style={{ flex: 1 }}>
        {label}
      </Text>
      <Ionicons name={choice === label ? "radio-button-on" : "radio-button-off"} size={20} color={choice === label ? "#3395FF" : t.colors.inkFaint} />
    </Pressable>
  );

  return (
    <Modal visible={!!order} transparent animationType="slide" onRequestClose={cancel}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.rzpHeader}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={styles.merchant}>
                <Text style={{ color: "#fff", fontWeight: "800" }}>G</Text>
              </View>
              <View>
                <Text variant="bodyStrong" style={{ color: "#fff" }}>
                  GasSetu
                </Text>
                <Text variant="caption" style={{ color: "#BFD9FF" }}>
                  {order?.orderId ?? ""} · Test mode
                </Text>
              </View>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text variant="h2" style={{ color: "#fff" }}>
                {order ? formatINR(order.amount / 100) : ""}
              </Text>
              <Pressable onPress={cancel} hitSlop={8} accessibilityLabel="Close checkout">
                <Text variant="caption" style={{ color: "#BFD9FF" }}>
                  Cancel
                </Text>
              </Pressable>
            </View>
          </View>

          {phase === "processing" ? (
            <View style={{ alignItems: "center", paddingVertical: 48, gap: 14 }}>
              <ActivityIndicator size="large" color="#3395FF" />
              <Text variant="bodyStrong">Processing payment…</Text>
              <Text variant="small" tone="muted">
                Do not press back or close the app
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.tabs}>
                {TABS.map((tb) => (
                  <Pressable key={tb.key} onPress={() => { setTab(tb.key); setChoice(null); }} accessibilityRole="tab" accessibilityState={{ selected: tab === tb.key }} style={[styles.tab, tab === tb.key && styles.tabActive]}>
                    <Ionicons name={tb.icon} size={16} color={tab === tb.key ? "#3395FF" : t.colors.inkMuted} />
                    <Text variant="caption" style={{ color: tab === tb.key ? "#3395FF" : t.colors.inkMuted }}>
                      {tb.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
                <View style={{ padding: 16, gap: 8 }}>
                  {tab === "upi" && (
                    <>
                      {UPI_APPS.map((a) => (
                        <Option key={a} label={a} icon="phone-portrait-outline" />
                      ))}
                      <Input placeholder="Or enter UPI ID (e.g. riya@upi)" value={upiId} onChangeText={(v) => { setUpiId(v); setChoice(v ? v : null); }} autoCapitalize="none" />
                    </>
                  )}
                  {tab === "card" && (
                    <>
                      <Input placeholder="Card number (test: 4111 1111 1111 1111)" keyboardType="number-pad" onChangeText={(v) => setChoice(v ? "card" : null)} />
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <View style={{ flex: 1 }}>
                          <Input placeholder="MM/YY" keyboardType="number-pad" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Input placeholder="CVV" keyboardType="number-pad" secureTextEntry />
                        </View>
                      </View>
                      <Text variant="caption" tone="faint">
                        Test mode — no real card is charged.
                      </Text>
                    </>
                  )}
                  {tab === "netbanking" && BANKS.map((b) => <Option key={b} label={b} icon="business-outline" />)}
                  {tab === "wallet" && WALLETS.map((w) => <Option key={w} label={w} icon="wallet-outline" />)}
                </View>
              </ScrollView>
              <View style={{ paddingHorizontal: 16, gap: 8 }}>
                <Button title={order ? `Pay ${formatINR(order.amount / 100)}` : "Pay"} onPress={() => finish(true)} disabled={!choice} style={{ backgroundColor: "#3395FF" }} />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button title="Test: Success" variant="ghost" size="sm" onPress={() => finish(true)} icon="checkmark-circle-outline" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button title="Test: Fail" variant="ghost" size="sm" onPress={() => finish(false)} icon="close-circle-outline" />
                  </View>
                </View>
                <Text variant="caption" tone="faint" center>
                  Secured by Razorpay (mock)
                </Text>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden" },
  rzpHeader: { backgroundColor: "#0C2451", padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  merchant: { width: 36, height: 36, borderRadius: 8, backgroundColor: "#3395FF", alignItems: "center", justifyContent: "center" },
  tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: t.colors.border },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, gap: 3, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: "#3395FF" },
  option: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: t.colors.border },
  optionActive: { borderColor: "#3395FF", backgroundColor: "#F2F8FF" },
  optionIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: t.colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
});
