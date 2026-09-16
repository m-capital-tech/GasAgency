import type { CylinderType, OMC } from "@gassetu/shared";

export const CYLINDER_TYPES: CylinderType[] = [
  { id: "cyl_14", name: "14.2 kg Domestic", weightKg: 14.2, category: "domestic" },
  { id: "cyl_5", name: "5 kg FTL", weightKg: 5, category: "domestic" },
  { id: "cyl_19", name: "19 kg Commercial", weightKg: 19, category: "commercial" },
  { id: "cyl_47", name: "47.5 kg Commercial", weightKg: 47.5, category: "commercial" },
];

// Illustrative prices (PRD §8.2)
export const BASE_PRICES: Record<string, number> = { cyl_14: 905, cyl_5: 340, cyl_19: 1750, cyl_47: 4350 };

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

export const FIRST_NAMES_F = ["Riya", "Ananya", "Lakshmi", "Priya", "Sneha", "Divya", "Kavya", "Meena", "Swathi", "Harini", "Nandini", "Pooja", "Sowmya", "Bhavana", "Jyothi", "Fatima", "Ayesha", "Rekha", "Vasundhara", "Padma"];
export const FIRST_NAMES_M = ["Ravi", "Suresh", "Kiran", "Naveen", "Srinivas", "Arjun", "Vikram", "Mahesh", "Rahul", "Sandeep", "Venkat", "Praveen", "Imran", "Anil", "Karthik", "Rajesh", "Mohan", "Ganesh", "Farhan", "Abdul"];
export const LAST_NAMES = ["Reddy", "Rao", "Sharma", "Kumar", "Naidu", "Goud", "Yadav", "Khan", "Iyer", "Chowdary", "Verma", "Prasad", "Devi", "Murthy", "Ali", "Nair", "Patel", "Babu", "Sagar", "Varma"];
export const BUSINESS_NAMES = ["Sai Tiffin Centre", "Al-Madina Biryani House", "Annapurna Mess", "Chai Point Corner", "Sri Lakshmi Bakery", "Ruchi Restaurant", "Hotel Swagath", "Deccan Dhaba", "Cafe Nirvana", "Star Kitchens Cloud", "Ganesh Sweets", "Bawarchi Express", "Mom's Kitchen Catering", "Udupi Grand", "Paradise Take-away"];
export const VEHICLES = ["Three-wheeler", "Three-wheeler", "Three-wheeler", "Mini truck", "Cycle cart", "Two-wheeler"];
