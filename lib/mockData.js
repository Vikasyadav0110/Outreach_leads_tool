// Realistic, context-aware mock data generators for each agent/step.
// Utilized when the Anthropic API is not available or depleted.

export function generateMockLeads(niche, city, domain) {
  const templates = [
    "{City} {Niche} Hub",
    "Taj {Niche} Services",
    "Radhe Radhe {Niche}",
    "{City} Digital {Niche}",
    "Sri Balaji {Niche} & Co",
    "Star {Niche} Center",
    "Apex {Niche} Solutions",
    "Elite {Niche} Professionals",
    "Royal {Niche} Group",
    "Metro {Niche} Agency",
    "Vikas {Niche} Studio",
    "Pioneer {Niche} Experts"
  ];
  
  const categories = {
    local: ["Retail Shop", "Local Services", "Restaurant", "Tour Operator"],
    realestate: ["Brokerage", "Property Agency", "Builder & Developer", "Consultancy"],
    health: ["Dental Clinic", "Physiotherapy Center", "General Practitioner", "Diagnostic Lab"],
    edtech: ["Coaching Institute", "Tuition Center", "Skills Academy", "Test Prep Center"]
  };
  
  const catOptions = categories[domain] || ["General Business"];
  
  const gaps = [
    "No website at all, only listed on local directories. No Google reviews answered.",
    "Has a basic website but it is completely broken on mobile devices and lacks clear contact info.",
    "Website exists but has outdated listings from last year. Lacks online enquiry forms.",
    "Listed on local platforms but website link is dead (404 error). Missing business location map.",
    "Has a website but missing lead-capture forms or online booking capability.",
    "Very slow website load time (over 8 seconds). Lacks call-to-action button for booking."
  ];

  const leads = [];
  const count = 10 + Math.floor(Math.random() * 3); // 10 to 12
  
  for (let i = 0; i < count; i++) {
    const template = templates[i % templates.length];
    const name = template.replace("{City}", city).replace("{Niche}", niche);
    const category = catOptions[i % catOptions.length];
    const score = 5 + Math.floor(Math.random() * 6); // 5 to 10
    const gap = gaps[i % gaps.length];
    const priority = score >= 7 ? "HIGH" : "NORMAL";
    
    // Website URL pattern
    let website = "none";
    if (score < 8) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "");
      website = `http://www.${slug}.in`;
    }
    
    leads.push({
      name,
      category,
      city,
      website,
      score,
      gap,
      source: "Google Maps / Directory Search (Simulated)",
      priority
    });
  }
  
  return leads;
}

export function generateMockQualify(domain, highLeads) {
  const firstNames = ["Amit", "Sanjay", "Rahul", "Priya", "Sunita", "Rajesh", "Deepak", "Anjali", "Rohan", "Vikram"];
  const lastNames = ["Kumar", "Sharma", "Singh", "Patel", "Gupta", "Joshi", "Verma", "Mehta", "Das", "Reddy"];
  
  const serviceTags = {
    local: "Website + Google Business setup",
    realestate: "Lead-capture landing page",
    health: "Online booking & appointment system",
    edtech: "Student enquiry & admission landing page"
  };
  
  return highLeads.map((lead, idx) => {
    const fn = firstNames[idx % firstNames.length];
    const ln = lastNames[idx % lastNames.length];
    const decisionMaker = `${fn} ${ln}`;
    const cleanName = lead.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    
    return {
      name: lead.name,
      exactGap: lead.gap,
      decisionMaker,
      // Intentionally-fake, non-dialable/non-emailable sentinels. They must
      // NEVER resolve to a real person's contact. toDigits("+91 00000 00000")
      // returns "910000000000" which is an unallocated Indian number range, and
      // isEmail("simulated@example.com") is technically valid but example.com
      // is an IANA reserved domain that accepts no mail — safe to display, but
      // the Send buttons are also force-disabled in mock mode as a second guard.
      whatsapp: "+91 00000 00000",
      email: "simulated@example.com",
      personalizationHook: `your local search presence shows great customer interest but lacks a dedicated mobile-friendly website to convert them`,
      serviceTag: serviceTags[domain] || "Digital setup"
    };
  });
}

export function generateMockMessages(domain, qualified, profile) {
  const meName = profile.name || "Vikas Sharma";
  const meLoc = profile.location || "Agra, UP";
  const meServices = profile.services || "Websites & Google Business setup";
  
  return qualified.map((lead) => {
    return {
      name: lead.name,
      email: {
        subject: `Quick question about digital presence for ${lead.name}`,
        body: `Hi ${lead.decisionMaker || "there"},\n\nI noticed ${lead.personalizationHook}. Since you have great reviews, having a proper website could easily double your online enquiries.\n\nI run a local agency in ${meLoc} specializing in ${meServices}. Would you be open to a quick 15-minute call this week to see how we can set this up for you?\n\nBest regards,\n${meName}`
      },
      whatsapp: `Hey ${lead.decisionMaker || "there"}! Noticed ${lead.name} has great ratings but no active mobile website. Customers are searching for you online! Let's build a quick lead-capture page. Free for a 15-min call? - ${meName}`,
      callScript: `[Opener] Hi, am I speaking with ${lead.decisionMaker}? Hi, this is ${meName} from ${meLoc}.\n[Pain Point] I noticed ${lead.name} has a strong listing but no active website to handle bookings/enquiries directly.\n[Proof] We recently built a simple lead-capture page for another local business that doubled their weekly enquiries.\n[Ask] Would you be free for a short 15-minute call this Thursday to discuss doing the same for you?`
    };
  });
}

export function generateMockPrepMeeting(domain, lead, context) {
  const objections = {
    local: [
      { objection: "Mera kaam toh word-of-mouth se chalta hai", response: "Sir, word-of-mouth best hai, but website reviews check karne wale naye customers ko trust build karne me help karegi." },
      { objection: "Paisa kahan hai abhi", response: "Sir, website cost nahi investment hai. Ek naya regular customer pure cost ko cover kar lega." },
      { objection: "Time nahi hai inn cheezon ke liye", response: "Sir, tension mat lijiye. Design se lekar launch tak sab mai handle karunga, aapka sirf 10 minute feedback chahiye." }
    ],
    realestate: [
      { objection: "I already list on 99acres", response: "Agreed, portals list you alongside 50 competitors. Your own site gives you exclusive undivided attention." },
      { objection: "My buyers come through references", response: "References search you online first to verify credibility before calling. A clean site protects your reputation." },
      { objection: "I don't have time to manage a website", response: "We handle hosting, updates, and maintenance completely, so you can focus on property deals." }
    ],
    health: [
      { objection: "Patients come by referral", response: "Doctor, referrals still search your name online to check hours and reviews before calling. A professional site secures them." },
      { objection: "I am too busy seeing patients", response: "We completely design, manage, and host the site. Your clinic staff will only receive booking emails directly." }
    ],
    edtech: [
      { objection: "Students reference se aate hain", response: "Sir, parents decide karne se pehle modern search presence check karte hain. Strong website trust build karti hai." },
      { objection: "Instagram pe toh hoon main", response: "Insta is good for posts, but details like fees, batch timings, and registration forms are much cleaner on your own portal." }
    ]
  };
  
  const dObjections = objections[domain] || objections["local"];
  
  return {
    intel: `Lead ${lead.name} is a high-potential business run by ${lead.decisionMaker}. Their primary gap is ${lead.exactGap}. Use this meeting to focus on getting their first exclusive digital asset.`,
    openingQuestion: `How do you currently capture enquiries from customers who discover ${lead.name} online?`,
    objections: dObjections,
    closingScripts: {
      soft: "Let's start with a simple 1-page site to show you how it works. No commitment.",
      trial: "We can set up a draft home page for you to review by next Tuesday. If you like it, we move forward.",
      urgency: "With the active search traffic right now, delaying another month is letting competitive leads slip away.",
      direct: "Shall we finalize the booking system setup and start drafting the design this week?"
    },
    positioningLine: `We build high-converting, simple websites for local businesses so they don't lose potential clients to competitors.`
  };
}
