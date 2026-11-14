import type { Category } from "./domain";

export type Lang = "mr" | "hi" | "en";
export const LANGS: { id: Lang; label: string }[] = [
  { id: "mr", label: "मराठी" },
  { id: "hi", label: "हिंदी" },
  { id: "en", label: "English" },
];

type Key =
  | "title"
  | "whatProblem"
  | "takePhoto"
  | "retake"
  | "photoHint"
  | "where"
  | "moveMap"
  | "useGps"
  | "send"
  | "next"
  | "back"
  | "sent"
  | "sentBody"
  | "myReports"
  | "meToo"
  | "dupTitle"
  | "dupBody"
  | "newAnyway"
  | "reportAnother"
  | "notCleaned"
  | "cleaned"
  | "outside"
  | "noReports";

export const T: Record<
  Lang,
  Record<Key, string> & { cat: Record<Category, string>; status: Record<string, string>; steps: [string, string, string, string] }
> = {
  mr: {
    title: "तक्रार नोंदवा",
    whatProblem: "काय समस्या आहे?",
    takePhoto: "फोटो घ्या",
    retake: "पुन्हा घ्या",
    photoHint: "समस्येचा स्पष्ट फोटो घ्या",
    where: "ठिकाण निश्चित करा",
    moveMap: "नकाशा हलवून पिन योग्य जागी ठेवा",
    useGps: "माझे ठिकाण वापरा",
    send: "पाठवा",
    next: "पुढे",
    back: "मागे",
    sent: "तक्रार नोंदवली",
    sentBody: "तुमची तक्रार झोन पर्यवेक्षकाकडे पाठवली आहे.",
    myReports: "माझ्या तक्रारी",
    meToo: "मलाही हीच समस्या",
    dupTitle: "ही तक्रार आधीच नोंदवली आहे",
    dupBody: "जवळच अशीच तक्रार आहे. नवीन तक्रार न करता तिला पाठिंबा द्या.",
    newAnyway: "तरीही नवीन तक्रार",
    reportAnother: "आणखी तक्रार नोंदवा",
    notCleaned: "साफ झाले नाही",
    cleaned: "साफ झाले",
    outside: "तुम्ही पायलट क्षेत्राबाहेर आहात. नकाशावर ठिकाण निवडा.",
    noReports: "अजून तक्रार नाही",
    cat: {
      garbage_dump: "कचऱ्याचा ढीग",
      overflowing_bin: "कचराकुंडी भरली",
      blocked_drain: "तुंबलेले गटार",
      stagnant_water: "साचलेले पाणी",
      missed_collection: "गाडी आली नाही",
      dead_animal: "मृत जनावर",
    },
    status: { open: "नोंदवली", assigned: "सोपवली", in_progress: "काम सुरू", resolved: "पूर्ण" },
    steps: ["तक्रार नोंदवली", "कर्मचाऱ्यांना सोपवली", "काम सुरू", "फोटोसह साफ केले"],
  },
  hi: {
    title: "शिकायत दर्ज करें",
    whatProblem: "क्या समस्या है?",
    takePhoto: "फोटो लें",
    retake: "दोबारा लें",
    photoHint: "समस्या की साफ़ फोटो लें",
    where: "स्थान की पुष्टि करें",
    moveMap: "नक्शा खिसकाकर पिन सही जगह रखें",
    useGps: "मेरा स्थान उपयोग करें",
    send: "भेजें",
    next: "आगे",
    back: "पीछे",
    sent: "शिकायत दर्ज हो गई",
    sentBody: "आपकी शिकायत ज़ोन पर्यवेक्षक को भेज दी गई है।",
    myReports: "मेरी शिकायतें",
    meToo: "मुझे भी यही समस्या है",
    dupTitle: "यह शिकायत पहले से दर्ज है",
    dupBody: "पास में ऐसी ही शिकायत है। नई शिकायत के बजाय उसका समर्थन करें।",
    newAnyway: "फिर भी नई शिकायत",
    reportAnother: "एक और शिकायत दर्ज करें",
    notCleaned: "सफ़ाई नहीं हुई",
    cleaned: "सफ़ाई हो गई",
    outside: "आप पायलट क्षेत्र से बाहर हैं। नक्शे पर स्थान चुनें।",
    noReports: "अभी कोई शिकायत नहीं",
    cat: {
      garbage_dump: "कचरे का ढेर",
      overflowing_bin: "कूड़ेदान भरा है",
      blocked_drain: "जाम नाली",
      stagnant_water: "रुका हुआ पानी",
      missed_collection: "गाड़ी नहीं आई",
      dead_animal: "मृत पशु",
    },
    status: { open: "दर्ज", assigned: "सौंपी गई", in_progress: "काम जारी", resolved: "पूरा" },
    steps: ["शिकायत दर्ज", "कर्मचारियों को सौंपी", "काम शुरू", "फोटो के साथ साफ़"],
  },
  en: {
    title: "Report a problem",
    whatProblem: "What is the problem?",
    takePhoto: "Take a photo",
    retake: "Retake",
    photoHint: "Take a clear photo of the problem",
    where: "Confirm the location",
    moveMap: "Move the map so the pin sits on the spot",
    useGps: "Use my location",
    send: "Send",
    next: "Next",
    back: "Back",
    sent: "Report filed",
    sentBody: "Your report has been sent to the zone supervisor.",
    myReports: "My reports",
    meToo: "I have this problem too",
    dupTitle: "This is already reported",
    dupBody: "There is a similar report right here. Support it instead of filing a new one.",
    newAnyway: "File a new one anyway",
    reportAnother: "Report another problem",
    notCleaned: "Not cleaned",
    cleaned: "It is clean",
    outside: "You are outside the pilot area. Pick the spot on the map.",
    noReports: "No reports yet",
    cat: {
      garbage_dump: "Garbage dump",
      overflowing_bin: "Overflowing bin",
      blocked_drain: "Blocked drain",
      stagnant_water: "Stagnant water",
      missed_collection: "Truck did not come",
      dead_animal: "Dead animal",
    },
    status: { open: "Reported", assigned: "Assigned", in_progress: "Work started", resolved: "Done" },
    steps: ["Reported", "Assigned to crew", "Work started", "Cleared with photo proof"],
  },
};
