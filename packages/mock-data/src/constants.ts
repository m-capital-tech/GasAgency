import type { BusinessType, CylinderType, OMC } from "@gassetu/shared";

export const CYLINDER_TYPES: CylinderType[] = [
  { id: "cyl_19", name: "19 kg Commercial", weightKg: 19 },
  { id: "cyl_47", name: "47.5 kg Commercial", weightKg: 47.5 },
];

// Illustrative commercial prices (ex-GST)
export const BASE_PRICES: Record<string, number> = { cyl_19: 1750, cyl_47: 4350 };

export interface AreaSeed {
  key: string;
  area: string;
  pincode: string;
  neighbours: string[];
  lat: number;
  lng: number;
  omc: OMC;
  name: string;
  status: "approved" | "pending";
}

export const AREAS: AreaSeed[] = [
  { key: "amberpet", area: "Amberpet", pincode: "500013", neighbours: ["500013", "500044", "500036", "500024"], lat: 17.3933, lng: 78.5142, omc: "HP", name: "Sri Venkateshwara Gas Agency", status: "approved" },
  { key: "kukatpally", area: "Kukatpally", pincode: "500072", neighbours: ["500072", "500085", "500018", "500090"], lat: 17.4849, lng: 78.4138, omc: "IOCL", name: "Balaji Indane Gramin Vitrak", status: "approved" },
  { key: "gachibowli", area: "Gachibowli", pincode: "500032", neighbours: ["500032", "500081", "500084", "500019"], lat: 17.4401, lng: 78.3489, omc: "BPCL", name: "Cyber City Bharat Gas", status: "approved" },
  { key: "secunderabad", area: "Secunderabad", pincode: "500003", neighbours: ["500003", "500009", "500025", "500026"], lat: 17.4399, lng: 78.4983, omc: "HP", name: "Deccan HP Gas Distributors", status: "approved" },
  { key: "lbnagar", area: "LB Nagar", pincode: "500074", neighbours: ["500074", "500035", "500068", "500060"], lat: 17.3497, lng: 78.5524, omc: "IOCL", name: "Sai Krishna Indane Agency", status: "approved" },
  { key: "mehdipatnam", area: "Mehdipatnam", pincode: "500028", neighbours: ["500028", "500008", "500004", "500057"], lat: 17.3949, lng: 78.4361, omc: "BPCL", name: "Golconda Bharat Gas Service", status: "approved" },
  { key: "uppal", area: "Uppal", pincode: "500039", neighbours: ["500039", "500098", "500062"], lat: 17.4056, lng: 78.5591, omc: "HP", name: "Uppal Sri Sai HP Gas", status: "pending" },
];

export const STREETS = [
  "Street No. 4, Vidyanagar", "Nallakunta Main Road", "Shivam Road", "Barkatpura Chaman", "Tilak Nagar", "Ramanthapur Colony",
  "KPHB Phase 3", "Vivekananda Nagar", "Balaji Nagar", "Moosapet X Roads", "JNTU Road", "Nizampet Road",
  "Indira Nagar, Gachibowli", "Financial District Rd", "Kondapur Main Rd", "Gowlidoddi", "Nanakramguda", "Telecom Nagar",
  "SP Road", "Paradise Circle", "Padmarao Nagar", "West Marredpally", "Bowenpally", "Sitaphalmandi",
  "Vanasthalipuram", "Saroor Nagar", "Nagole", "Hastinapuram", "Kothapet", "Dilsukhnagar",
  "Asif Nagar", "Humayun Nagar", "Masab Tank", "Tolichowki", "Gudimalkapur", "Vijayanagar Colony",
];

export const FIRST_NAMES = ["Ravi", "Suresh", "Kiran", "Naveen", "Srinivas", "Arjun", "Vikram", "Mahesh", "Rahul", "Sandeep", "Venkat", "Praveen", "Imran", "Anil", "Karthik", "Rajesh", "Mohan", "Ganesh", "Farhan", "Abdul", "Lakshmi", "Priya", "Sneha", "Divya", "Fatima", "Ayesha", "Rekha", "Padma", "Swathi", "Harini"];
export const LAST_NAMES = ["Reddy", "Rao", "Sharma", "Kumar", "Naidu", "Goud", "Yadav", "Khan", "Iyer", "Chowdary", "Verma", "Prasad", "Devi", "Murthy", "Ali", "Nair", "Patel", "Babu", "Sagar", "Varma"];

export const BUSINESSES: { name: string; type: BusinessType; perWeek: number; big?: boolean }[] = [
  { name: "Al-Madina Tiffin Centre", type: "tiffin_centre", perWeek: 3 },
  { name: "Sai Tiffin Centre", type: "tiffin_centre", perWeek: 2 },
  { name: "Annapurna Mess", type: "canteen", perWeek: 4 },
  { name: "Chai Point Corner", type: "tea_stall", perWeek: 1 },
  { name: "Sri Lakshmi Bakery", type: "bakery", perWeek: 2 },
  { name: "Ruchi Restaurant", type: "restaurant", perWeek: 5 },
  { name: "Hotel Swagath", type: "hotel", perWeek: 7, big: true },
  { name: "Deccan Dhaba", type: "restaurant", perWeek: 4 },
  { name: "Cafe Nirvana", type: "tea_stall", perWeek: 1.5 },
  { name: "Star Kitchens Cloud", type: "cloud_kitchen", perWeek: 6 },
  { name: "Ganesh Sweets", type: "bakery", perWeek: 3 },
  { name: "Bawarchi Express", type: "restaurant", perWeek: 6, big: true },
  { name: "Mom's Kitchen Catering", type: "cloud_kitchen", perWeek: 4 },
  { name: "Udupi Grand", type: "restaurant", perWeek: 5 },
  { name: "Paradise Take-away", type: "restaurant", perWeek: 5 },
  { name: "JNTU Hostel Mess", type: "canteen", perWeek: 8, big: true },
  { name: "Care Hospital Canteen", type: "hospital", perWeek: 4, big: true },
  { name: "Shah Ghouse Café", type: "restaurant", perWeek: 6 },
  { name: "Kritunga Kitchens", type: "cloud_kitchen", perWeek: 5 },
  { name: "Minerva Coffee Shop", type: "restaurant", perWeek: 4 },
  { name: "Rayalaseema Ruchulu", type: "restaurant", perWeek: 5 },
  { name: "Karachi Bakery Outlet", type: "bakery", perWeek: 3 },
  { name: "Nimrah Café", type: "tea_stall", perWeek: 2 },
  { name: "Pista House Kitchen", type: "cloud_kitchen", perWeek: 6, big: true },
  { name: "Green Park Hotel", type: "hotel", perWeek: 8, big: true },
  { name: "Osmania Hostel Mess", type: "canteen", perWeek: 7, big: true },
  { name: "Café Bahar", type: "restaurant", perWeek: 5 },
  { name: "Subbayya Gari Hotel", type: "restaurant", perWeek: 5 },
  { name: "Tea Time Franchise", type: "tea_stall", perWeek: 1 },
  { name: "Apollo Cafeteria", type: "hospital", perWeek: 5, big: true },
  { name: "Biryani Box Cloud", type: "cloud_kitchen", perWeek: 4 },
  { name: "Grand Kakatiya Kitchens", type: "hotel", perWeek: 9, big: true },
  { name: "Dosa Corner", type: "tiffin_centre", perWeek: 2 },
  { name: "Idli Express", type: "tiffin_centre", perWeek: 2 },
  { name: "Mehfil Restaurant", type: "restaurant", perWeek: 6 },
  { name: "Chutneys Cloud", type: "cloud_kitchen", perWeek: 4 },
  { name: "Balaji Sweets & Snacks", type: "bakery", perWeek: 2 },
  { name: "Iron Hill Café", type: "restaurant", perWeek: 4 },
  { name: "Nizam Club Kitchen", type: "hotel", perWeek: 6, big: true },
  { name: "Infosys Food Court", type: "canteen", perWeek: 10, big: true },
];

export const VEHICLES = ["Three-wheeler", "Three-wheeler", "Mini truck", "Mini truck", "Tata Ace", "Three-wheeler"];
