"""Literal data transcribed from reference/empm_app12_demo.html's `DATA` object,
so the real app seeds with the same 3 resellers / 7 companies / ~40 systems /
sample alarms / reports / on-call rotations as the original demo.

Keys are the demo's string slugs (e.g. "powerguard", "msk-kim") — seed_data.py
maps these to generated UUID primary keys when inserting rows.
"""

RESELLERS = {
    "powerguard": {"name": "PowerGuard Solutions", "companies": ["msk", "piedmont", "duke"]},
    "criticalpath": {"name": "CriticalPath Energy", "companies": ["nyu", "jhu", "unc"]},
    "medpower": {"name": "MedPower Direct", "companies": ["capefear"]},
}

COMPANIES = {
    "msk": {
        "name": "Cancer Center", "city": "New York, NY", "reseller": "powerguard",
        "lat": 40.7645, "lng": -73.9565,
        "systems": ["msk-kim", "msk-ter", "msk-chp", "msk-kch", "msk-sch", "msk-rpv"],
    },
    "piedmont": {
        "name": "Passing Medical Center", "city": "Charlotte, NC", "reseller": "powerguard",
        "lat": 35.2271, "lng": -80.8431,
        "systems": ["pie-gld", "pie-ew", "pie-st", "pie-opc"],
    },
    "duke": {
        "name": "University Health", "city": "Durham, NC", "reseller": "powerguard",
        "lat": 36.0085, "lng": -78.9290,
        "systems": ["duk-mdp1", "duk-ral", "duk-reg", "duk-np", "duk-sc", "duk-cc", "duk-eye", "duk-ch"],
    },
    "nyu": {
        "name": "NYC Hospital", "city": "New York, NY", "reseller": "criticalpath",
        "lat": 40.7421, "lng": -73.9739,
        "systems": ["nyu-tis", "nyu-kim", "nyu-has", "nyu-rsk", "nyu-sci"],
    },
    "jhu": {
        "name": "Peoples Hospital", "city": "Baltimore, MD", "reseller": "criticalpath",
        "lat": 39.2968, "lng": -76.5925,
        "systems": ["jhu-wbg", "jhu-blt", "jhu-wlm", "jhu-nh", "jhu-php"],
    },
    "unc": {
        "name": "Ronal Hospital", "city": "Chapel Hill, NC", "reseller": "criticalpath",
        "lat": 35.9110, "lng": -79.0559,
        "systems": ["unc-mh", "unc-ncc", "unc-hil", "unc-ner", "unc-chd", "unc-bw", "unc-den", "unc-fri"],
    },
    "capefear": {
        "name": "Suburban Outpatient", "city": "Fayetteville, NC", "reseller": "medpower",
        "lat": 35.0527, "lng": -78.8784,
        "systems": ["cfv-mh", "cfv-rc", "cfv-bh", "cfv-bc", "cfv-hk", "cfv-hh", "cfv-hr", "cfv-ac", "cfv-cc", "cfv-hp"],
    },
}

# status: normal | emergency | alarm | test — display-only snapshot for this milestone.
SYSTEMS = {
    "pie-gld": {"name": "Gold Hill", "company": "piedmont", "status": "emergency", "atsCount": 3, "genCount": 1},
    "msk-kim": {"name": "Kimmel Building", "company": "msk", "status": "normal", "atsCount": 2, "genCount": 1},
    "msk-ter": {"name": "Terrace Building", "company": "msk", "status": "test", "atsCount": 4, "genCount": 2},
    "msk-chp": {"name": "Chapel Building", "company": "msk", "status": "normal", "atsCount": 3, "genCount": 1},
    "msk-kch": {"name": "Koch Center", "company": "msk", "status": "normal", "atsCount": 3, "genCount": 2},
    "msk-sch": {"name": "Schwartz Building", "company": "msk", "status": "normal", "atsCount": 2, "genCount": 1},
    "msk-rpv": {"name": "Rockefeller Pavilion", "company": "msk", "status": "normal", "atsCount": 5, "genCount": 2},
    "pie-ew": {"name": "East Wing", "company": "piedmont", "status": "normal", "atsCount": 5, "genCount": 2},
    "pie-st": {"name": "South Tower", "company": "piedmont", "status": "normal", "atsCount": 4, "genCount": 2},
    "pie-opc": {"name": "Outpatient Center", "company": "piedmont", "status": "normal", "atsCount": 2, "genCount": 1},
    "duk-mdp1": {"name": "Main Campus MDP-1", "company": "duke", "status": "alarm", "atsCount": 6, "genCount": 3},
    "duk-ral": {"name": "Duke Raleigh", "company": "duke", "status": "normal", "atsCount": 4, "genCount": 2},
    "duk-reg": {"name": "Duke Regional", "company": "duke", "status": "normal", "atsCount": 3, "genCount": 2},
    "duk-np": {"name": "North Pavilion", "company": "duke", "status": "normal", "atsCount": 4, "genCount": 2},
    "duk-sc": {"name": "South Clinics", "company": "duke", "status": "normal", "atsCount": 3, "genCount": 1},
    "duk-cc": {"name": "Cancer Center", "company": "duke", "status": "normal", "atsCount": 5, "genCount": 2},
    "duk-eye": {"name": "Eye Center", "company": "duke", "status": "normal", "atsCount": 2, "genCount": 1},
    "duk-ch": {"name": "Children's Health", "company": "duke", "status": "normal", "atsCount": 3, "genCount": 2},
    "nyu-tis": {"name": "Tisch Hospital", "company": "nyu", "status": "normal", "atsCount": 8, "genCount": 4},
    "nyu-kim": {"name": "Kimmel Pavilion", "company": "nyu", "status": "normal", "atsCount": 5, "genCount": 2},
    "nyu-has": {"name": "Hassenfeld Center", "company": "nyu", "status": "normal", "atsCount": 3, "genCount": 1},
    "nyu-rsk": {"name": "Rusk Rehabilitation", "company": "nyu", "status": "normal", "atsCount": 2, "genCount": 1},
    "nyu-sci": {"name": "Science Building", "company": "nyu", "status": "normal", "atsCount": 4, "genCount": 2},
    "jhu-wbg": {"name": "Weinberg Building", "company": "jhu", "status": "normal", "atsCount": 4, "genCount": 2},
    "jhu-blt": {"name": "Bloomberg Tower", "company": "jhu", "status": "normal", "atsCount": 6, "genCount": 3},
    "jhu-wlm": {"name": "Wilmer Eye", "company": "jhu", "status": "normal", "atsCount": 2, "genCount": 1},
    "jhu-nh": {"name": "Nelson-Harvey", "company": "jhu", "status": "normal", "atsCount": 3, "genCount": 2},
    "jhu-php": {"name": "Phipps Building", "company": "jhu", "status": "normal", "atsCount": 3, "genCount": 1},
    "unc-mh": {"name": "Main Hospital", "company": "unc", "status": "normal", "atsCount": 6, "genCount": 3},
    "unc-ncc": {"name": "NC Cancer Hospital", "company": "unc", "status": "normal", "atsCount": 4, "genCount": 2},
    "unc-hil": {"name": "Hillsborough Campus", "company": "unc", "status": "normal", "atsCount": 5, "genCount": 2},
    "unc-ner": {"name": "Neurosciences", "company": "unc", "status": "normal", "atsCount": 3, "genCount": 1},
    "unc-chd": {"name": "Children's Hospital", "company": "unc", "status": "normal", "atsCount": 4, "genCount": 2},
    "unc-bw": {"name": "Burnett-Womack", "company": "unc", "status": "normal", "atsCount": 3, "genCount": 1},
    "unc-den": {"name": "Dental School", "company": "unc", "status": "normal", "atsCount": 2, "genCount": 1},
    "unc-fri": {"name": "Friday Center", "company": "unc", "status": "normal", "atsCount": 2, "genCount": 1},
    "cfv-mh": {"name": "Main Hospital", "company": "capefear", "status": "normal", "atsCount": 5, "genCount": 3},
    "cfv-rc": {"name": "Rehabilitation Center", "company": "capefear", "status": "normal", "atsCount": 3, "genCount": 1},
    "cfv-bh": {"name": "Behavioral Health", "company": "capefear", "status": "normal", "atsCount": 2, "genCount": 1},
    "cfv-bc": {"name": "Bladen County", "company": "capefear", "status": "normal", "atsCount": 3, "genCount": 2},
    "cfv-hk": {"name": "Hoke Hospital", "company": "capefear", "status": "normal", "atsCount": 3, "genCount": 2},
    "cfv-hh": {"name": "Harnett Health", "company": "capefear", "status": "normal", "atsCount": 4, "genCount": 2},
    "cfv-hr": {"name": "Highsmith-Rainey", "company": "capefear", "status": "normal", "atsCount": 3, "genCount": 1},
    "cfv-ac": {"name": "Ambulatory Care", "company": "capefear", "status": "normal", "atsCount": 2, "genCount": 1},
    "cfv-cc": {"name": "Cancer Center", "company": "capefear", "status": "normal", "atsCount": 2, "genCount": 1},
    "cfv-hp": {"name": "Health Pavilion", "company": "capefear", "status": "normal", "atsCount": 3, "genCount": 2},
}

# Gold Hill (pie-gld) has explicit ATS/generator detail in the demo — every other system
# is hydrated procedurally by seed_data.py's deterministic generator, mirroring the demo's
# getSystemDetail() hash-seeded approach so every system gets realistic panel/ATS/generator rows.
PIE_GLD_GENERATOR = {
    "name": "GEN-GLD", "make": "Cummins", "model": "DQKAB", "rated_kw": 500,
    "rated_volts": 480, "rated_amps": 601,
}
PIE_GLD_ATS = [
    {"name": "ATS-LS", "branch": "life-safety", "manufacturer": "Cummins", "serial_number": "G19M611773", "rated_amps": 105, "rated_volts": 482},
    {"name": "ATS-CR", "branch": "critical", "manufacturer": "Cummins", "serial_number": "G19M611796", "rated_amps": 149, "rated_volts": 483},
    {"name": "ATS-EQ1", "branch": "equipment", "manufacturer": "Cummins", "serial_number": "G19M611795", "rated_amps": 188, "rated_volts": 481},
]

ALARMS = [
    {"time": "14:32:07", "date": "2026-03-20", "system": "pie-gld", "device": "ATS-LS", "message": "Loss of Normal Power", "severity": "critical", "status": "active", "ack_by": None, "ack_at": None},
    {"time": "14:27:15", "date": "2026-03-20", "system": "msk-ter", "device": "GEN-TER", "message": "Generator Running (Test)", "severity": "info", "status": "active", "ack_by": "Maria Rodriguez", "ack_at": "2026-03-20 14:28:01"},
    {"time": "13:10:02", "date": "2026-03-20", "system": "duk-mdp1", "device": "GEN-MDP1", "message": "Low Oil Pressure", "severity": "warning", "status": "active", "ack_by": "David Park", "ack_at": "2026-03-20 13:12:44"},
    {"time": "09:15:33", "date": "2026-03-20", "system": "msk-ter", "device": "ATS-21", "message": "Test Completed", "severity": "info", "status": "cleared", "ack_by": "Maria Rodriguez", "ack_at": "2026-03-20 09:16:10"},
    {"time": "08:45:12", "date": "2026-03-20", "system": "pie-ew", "device": "ATS-CR", "message": "High Temperature Warning", "severity": "warning", "status": "active", "ack_by": None, "ack_at": None},
    {"time": "07:30:00", "date": "2026-03-20", "system": "jhu-wbg", "device": "GEN-WBG", "message": "Scheduled Maintenance Due", "severity": "info", "status": "active", "ack_by": "Tech Support", "ack_at": "2026-03-20 07:35:00"},
    {"time": "23:12:45", "date": "2026-03-19", "system": "duk-ral", "device": "ATS-LS", "message": "Transfer Test Failed", "severity": "critical", "status": "cleared", "ack_by": "David Park", "ack_at": "2026-03-19 23:15:20"},
    {"time": "18:05:33", "date": "2026-03-19", "system": "pie-gld", "device": "GEN-GLD", "message": "Fuel Level Below 25%", "severity": "warning", "status": "cleared", "ack_by": "James Wilson", "ack_at": "2026-03-19 18:10:00"},
    {"time": "06:22:11", "date": "2026-03-20", "system": "unc-mh", "device": "ATS-EQ1", "message": "Communication Fault", "severity": "warning", "status": "active", "ack_by": None, "ack_at": None},
    {"time": "04:55:00", "date": "2026-03-20", "system": "cfv-mh", "device": "GEN-MH", "message": "Battery Charger Fault", "severity": "warning", "status": "active", "ack_by": None, "ack_at": None},
]

REPORTS = [
    {"id": "GEN_KIM_202603190037", "type": "gen-run", "system": "msk-kim", "date": "2026-03-19", "time": "00:37", "duration": "36 min", "durationMin": 36, "initiatingAts": "ATS-LS", "ratedKW": 350, "peakKW": 187, "avgKW": 142, "loadProfile": [22,45,68,89,112,132,140,145,142,138,135,140,148,155,160,158,150,142,138,135,132,128,124,120,115,110,105,100,95,88,72,55,38,22,10,0]},
    {"id": "PIE_GLD_ATS_202603180930", "type": "ats-emergency", "system": "pie-gld", "date": "2026-03-18", "time": "09:30", "duration": "12 min", "durationMin": 12, "initiatingAts": "ATS-LS", "ratedKW": 500, "peakKW": 367, "avgKW": 312, "loadProfile": [0,85,185,267,312,330,345,355,367,360,342,310,245,180,95,0]},
    {"id": "DUK_MDP1_GEN_202603171422", "type": "gen-run", "system": "duk-mdp1", "date": "2026-03-17", "time": "14:22", "duration": "1h 22m", "durationMin": 82, "initiatingAts": "ATS-CR", "ratedKW": 800, "peakKW": 485, "avgKW": 390, "loadProfile": [0,55,120,195,260,310,345,370,385,390,395,388,392,398,402,410,418,425,430,435,440,445,450,455,460,465,470,475,480,485,482,478,472,465,458,450,442,435,428,420,415,410,405,400,395,390,385,380,375,370,365,360,355,350,345,340,335,330,325,320,310,295,280,260,240,220,195,170,145,120,95,70,45,20,0]},
    {"id": "STM_CPL_ATS_202603161105", "type": "test", "system": "msk-chp", "date": "2026-03-16", "time": "11:05", "duration": "8 min", "durationMin": 8, "initiatingAts": "ATS-EQ1", "ratedKW": 400, "peakKW": 210, "avgKW": 175, "loadProfile": [0,42,95,138,165,178,188,195,200,205,210,208,202,195,185,170,140,105,60,0]},
    {"id": "PIE_GLD_GEN_202603150422", "type": "gen-run", "system": "pie-gld", "date": "2026-03-15", "time": "04:22", "duration": "8 min", "durationMin": 8, "initiatingAts": "ATS-CR", "ratedKW": 500, "peakKW": 195, "avgKW": 148, "loadProfile": [0,38,72,105,135,158,172,182,190,195,188,180,168,152,130,105,72,35,0]},
    {"id": "PIE_GLD_TST_202603101000", "type": "test", "system": "pie-gld", "date": "2026-03-10", "time": "10:00", "duration": "30 min", "durationMin": 30, "initiatingAts": "ATS-EQ1", "ratedKW": 500, "peakKW": 312, "avgKW": 258, "loadProfile": [0,35,72,120,165,200,225,242,252,258,262,268,275,280,285,290,295,300,305,308,312,310,305,298,288,272,252,225,190,145,95,42,0]},
    {"id": "JHU_WBG_TST_202603101000", "type": "test", "system": "jhu-wbg", "date": "2026-03-10", "time": "10:00", "duration": "25 min", "durationMin": 25, "initiatingAts": "ATS-LS", "ratedKW": 550, "peakKW": 288, "avgKW": 232, "loadProfile": [0,42,88,132,175,210,235,245,252,258,262,268,272,278,282,285,288,285,280,272,262,248,225,195,155,110,58,0]},
    {"id": "NYU_TIS_GEN_202603121400", "type": "gen-run", "system": "nyu-tis", "date": "2026-03-12", "time": "14:00", "duration": "15 min", "durationMin": 15, "initiatingAts": "ATS-LS", "ratedKW": 1200, "peakKW": 512, "avgKW": 395, "loadProfile": [0,65,142,225,310,378,420,448,475,495,505,512,508,498,485,470,450,425,395,360,315,262,195,120,48,0]},
    {"id": "UNC_MH_GEN_202603081600", "type": "gen-run", "system": "unc-mh", "date": "2026-03-08", "time": "16:00", "duration": "22 min", "durationMin": 22, "initiatingAts": "ATS-CR", "ratedKW": 750, "peakKW": 408, "avgKW": 335, "loadProfile": [0,45,95,155,218,272,310,335,352,365,375,382,390,395,400,405,408,402,392,378,358,330,295,250,195,135,72,0]},
    {"id": "CFV_MH_TST_202603051200", "type": "test", "system": "cfv-mh", "date": "2026-03-05", "time": "12:00", "duration": "30 min", "durationMin": 30, "initiatingAts": "ATS-CR", "ratedKW": 600, "peakKW": 345, "avgKW": 278, "loadProfile": [0,32,68,112,158,198,228,248,262,272,278,282,288,295,302,310,318,325,332,338,342,345,340,332,318,298,272,238,195,142,82,25,0]},
    {"id": "PIE_EW_TST_202602251000", "type": "test", "system": "pie-ew", "date": "2026-02-25", "time": "10:00", "duration": "30 min", "durationMin": 30, "initiatingAts": "ATS-LS", "ratedKW": 650, "peakKW": 375, "avgKW": 298, "loadProfile": [0,38,82,135,188,235,268,292,305,312,318,325,332,340,348,355,362,368,372,375,372,365,352,335,310,278,238,190,135,72,0]},
    {"id": "PIE_ST_GEN_202602201400", "type": "gen-run", "system": "pie-st", "date": "2026-02-20", "time": "14:00", "duration": "18 min", "durationMin": 18, "initiatingAts": "ATS-LS", "ratedKW": 500, "peakKW": 245, "avgKW": 188, "loadProfile": [0,28,62,105,148,182,205,222,232,238,242,245,240,232,218,198,172,138,98,55,0]},
    {"id": "MSK_TER_TST_202602151000", "type": "test", "system": "msk-ter", "date": "2026-02-15", "time": "10:00", "duration": "30 min", "durationMin": 30, "initiatingAts": "ATS-LS", "ratedKW": 550, "peakKW": 318, "avgKW": 255, "loadProfile": [0,35,75,118,162,198,228,248,258,265,272,278,285,292,298,305,310,315,318,315,310,302,288,268,242,210,172,128,78,0]},
    {"id": "PIE_OPC_TST_202602101000", "type": "test", "system": "pie-opc", "date": "2026-02-10", "time": "10:00", "duration": "30 min", "durationMin": 30, "initiatingAts": "ATS-LS", "ratedKW": 250, "peakKW": 155, "avgKW": 122, "loadProfile": [0,18,42,68,92,108,118,125,130,135,140,142,145,148,150,152,155,152,148,142,135,125,112,95,72,45,0]},
    {"id": "DUK_RAL_GEN_202602081200", "type": "gen-run", "system": "duk-ral", "date": "2026-02-08", "time": "12:00", "duration": "45 min", "durationMin": 45, "initiatingAts": "ATS-LS", "ratedKW": 500, "peakKW": 285, "avgKW": 228, "loadProfile": [0,32,68,108,148,182,210,228,238,245,250,255,260,265,268,272,275,278,280,282,285,282,278,272,265,255,242,225,205,182,155,125,92,58,0]},
    {"id": "MSK_KCH_TST_202601201000", "type": "test", "system": "msk-kch", "date": "2026-01-20", "time": "10:00", "duration": "30 min", "durationMin": 30, "initiatingAts": "ATS-CR", "ratedKW": 400, "peakKW": 228, "avgKW": 182, "loadProfile": [0,22,52,85,118,148,172,188,198,205,210,215,220,222,225,228,225,220,212,202,188,170,148,122,92,58,0]},
    {"id": "PIE_GLD_TST_202601151000", "type": "test", "system": "pie-gld", "date": "2026-01-15", "time": "10:00", "duration": "30 min", "durationMin": 30, "initiatingAts": "ATS-LS", "ratedKW": 500, "peakKW": 295, "avgKW": 242, "loadProfile": [0,32,68,112,155,192,222,242,252,258,265,272,278,282,288,292,295,292,288,280,268,252,232,205,172,132,85,35,0]},
    {"id": "DUK_MDP1_TST_202601101000", "type": "test", "system": "duk-mdp1", "date": "2026-01-10", "time": "10:00", "duration": "30 min", "durationMin": 30, "initiatingAts": "ATS-LS", "ratedKW": 800, "peakKW": 452, "avgKW": 368, "loadProfile": [0,48,102,165,228,285,328,358,378,392,402,412,418,425,432,438,442,448,452,448,442,432,418,398,372,338,298,248,192,128,58,0]},
]

# On-call schedules are keyed by company slug, week of 2026-03-16.
ONCALL = {
    "piedmont": [
        {"day": "Mon", "date": "2026-03-16", "primary": "James Wilson", "secondary": "Tom Harris"},
        {"day": "Tue", "date": "2026-03-17", "primary": "James Wilson", "secondary": "Tom Harris"},
        {"day": "Wed", "date": "2026-03-18", "primary": "Tom Harris", "secondary": "James Wilson"},
        {"day": "Thu", "date": "2026-03-19", "primary": "Tom Harris", "secondary": "Amy Chen"},
        {"day": "Fri", "date": "2026-03-20", "primary": "James Wilson", "secondary": "Tom Harris"},
        {"day": "Sat", "date": "2026-03-21", "primary": "Amy Chen", "secondary": "James Wilson"},
        {"day": "Sun", "date": "2026-03-22", "primary": "Amy Chen", "secondary": "Tom Harris"},
    ],
    "msk": [
        {"day": "Mon", "date": "2026-03-16", "primary": "Maria Rodriguez", "secondary": "Ken Tanaka"},
        {"day": "Tue", "date": "2026-03-17", "primary": "Maria Rodriguez", "secondary": "Ken Tanaka"},
        {"day": "Wed", "date": "2026-03-18", "primary": "Ken Tanaka", "secondary": "Maria Rodriguez"},
        {"day": "Thu", "date": "2026-03-19", "primary": "Ken Tanaka", "secondary": "Maria Rodriguez"},
        {"day": "Fri", "date": "2026-03-20", "primary": "Maria Rodriguez", "secondary": "Ken Tanaka"},
        {"day": "Sat", "date": "2026-03-21", "primary": "Ken Tanaka", "secondary": "Maria Rodriguez"},
        {"day": "Sun", "date": "2026-03-22", "primary": "Maria Rodriguez", "secondary": "Ken Tanaka"},
    ],
    "duke": [
        {"day": "Mon", "date": "2026-03-16", "primary": "David Park", "secondary": "Raj Patel"},
        {"day": "Tue", "date": "2026-03-17", "primary": "David Park", "secondary": "Raj Patel"},
        {"day": "Wed", "date": "2026-03-18", "primary": "Raj Patel", "secondary": "David Park"},
        {"day": "Thu", "date": "2026-03-19", "primary": "Raj Patel", "secondary": "David Park"},
        {"day": "Fri", "date": "2026-03-20", "primary": "David Park", "secondary": "Raj Patel"},
        {"day": "Sat", "date": "2026-03-21", "primary": "Raj Patel", "secondary": "David Park"},
        {"day": "Sun", "date": "2026-03-22", "primary": "David Park", "secondary": "Raj Patel"},
    ],
}
