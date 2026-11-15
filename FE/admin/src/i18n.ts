// English + Hindi strings (AGENTS.md UI rules). Language toggle in the top bar.
export const strings = {
  en: {
    brand: 'Diamond Control Room', dashboard: 'Dashboard', orders: 'Orders', tracking: 'Live Tracking', catalogue: 'Catalogue',
    inventory: 'Inventory', kits: 'Operation Kits', templates: 'Procedure Templates', doctors: 'Doctors', hospitals: 'Hospitals',
    agents: 'Delivery Agents', notifications: 'Notifications', reports: 'Reports', settings: 'Settings', staff: 'Staff & Roles', audit: 'Audit Log',
    logout: 'Log out', login: 'Sign in', phone: 'Mobile number', sendOtp: 'Send OTP', verify: 'Verify & sign in', otp: 'OTP',
    todayOrders: "Today's orders", revenue: "Today's revenue", emergencies: 'Emergencies waiting', lowStock: 'Low stock', outOfStock: 'Out of stock',
    kitsOnLoan: 'Kits on loan', pendingDoctors: 'Doctors to approve', onRoad: 'On the road', retry: 'Retry', empty: 'Nothing here yet',
    loading: 'Loading…', search: 'Search…', emergencyBanner: 'EMERGENCY order waiting for acceptance', accept: 'Accept', reject: 'Reject',
  },
  hi: {
    brand: 'डायमंड कंट्रोल रूम', dashboard: 'डैशबोर्ड', orders: 'ऑर्डर', tracking: 'लाइव ट्रैकिंग', catalogue: 'कैटलॉग',
    inventory: 'स्टॉक', kits: 'ऑपरेशन किट', templates: 'प्रोसीजर टेम्पलेट', doctors: 'डॉक्टर', hospitals: 'अस्पताल',
    agents: 'डिलीवरी एजेंट', notifications: 'सूचनाएँ', reports: 'रिपोर्ट', settings: 'सेटिंग्स', staff: 'स्टाफ और भूमिकाएँ', audit: 'ऑडिट लॉग',
    logout: 'लॉग आउट', login: 'साइन इन', phone: 'मोबाइल नंबर', sendOtp: 'OTP भेजें', verify: 'सत्यापित करें', otp: 'OTP',
    todayOrders: 'आज के ऑर्डर', revenue: 'आज की बिक्री', emergencies: 'इमरजेंसी प्रतीक्षा में', lowStock: 'कम स्टॉक', outOfStock: 'स्टॉक खत्म',
    kitsOnLoan: 'लोन पर किट', pendingDoctors: 'स्वीकृति हेतु डॉक्टर', onRoad: 'रास्ते में', retry: 'फिर से', empty: 'अभी कुछ नहीं',
    loading: 'लोड हो रहा है…', search: 'खोजें…', emergencyBanner: 'इमरजेंसी ऑर्डर स्वीकृति की प्रतीक्षा में', accept: 'स्वीकार', reject: 'अस्वीकार',
  },
} as const;

export type Lang = keyof typeof strings;
export type StringKey = keyof (typeof strings)['en'];
