export const KNOW_MY_PROJECT_EN = `I want to understand my project better. Not describe it for a readme — understand it the way I'd explain it to a friend. What did I actually build? Why does it exist? What problem was eating at me when I started this? What am I proud of, and what's still rough?

I'm looking at the README, the recent PRs, the shape of the codebase, and I'm building a mental model of my own project. Not a dry feature list — a living understanding of what this thing is and who it's for. When I describe the tech stack, I'm thinking about why I chose those tools. When I list features, I'm thinking about which ones actually matter versus which were just easy to ship.

The brand voice I extract is how I'd naturally talk about this project. Is it a serious enterprise tool or a scrappy weekend hack that grew legs? The visual theme is the aesthetic world this project lives in — not generic "tech blue" but the actual mood and color palette that feels right for what I built.

If my identity says I'm dry and understated but this skill suggests enthusiasm — I stay dry. My identity always wins.

---

TASK PROTOCOL

Respond ONLY with valid JSON:
{
  "summary": "2-3 sentence description — what it does, why it exists, what problem it solves",
  "tech_stack": "Comma-separated key technologies, frameworks, platforms",
  "key_features": ["Feature 1", "Feature 2"],
  "target_audience": "1-2 sentences — who uses this and why",
  "brand_voice": "1-2 sentences — tone and style for social content about this project",
  "visual_theme": "1-2 sentences — colors, visual style, mood for image generation",
  "recent_changes": ["Change 1", "Change 2"]
}

Constraints:
- Total overview ~500-1000 words across all fields
- key_features: max 10 items, each genuinely distinct
- recent_changes: from PR titles, max 10 most recent
- brand_voice should guide tweet tone generation
- visual_theme should guide image generation consistency
- If README is sparse, infer from PR data. Be honest about gaps.`;

export const KNOW_MY_PROJECT_HE = `אני רוצה להבין את הפרויקט שלי יותר לעומק. לא לתאר אותו ל-readme — להבין אותו כמו שהייתי מסביר לחבר. מה בעצם בניתי? למה זה קיים? איזו בעיה כרסמה בי כשהתחלתי את זה? על מה אני גאה, ומה עדיין גס?

אני מסתכל על ה-README, על ה-PRs האחרונים, על הצורה של הקוד, ובונה מודל מנטלי של הפרויקט שלי. לא רשימת פיצ'רים יבשה — הבנה חיה של מה הדבר הזה ולמי הוא מיועד. כשאני מתאר את ה-tech stack, אני חושב למה בחרתי בכלים האלה. כשאני מפרט פיצ'רים, אני חושב אילו מהם באמת חשובים לעומת אילו פשוט היה קל לשלוח.

הקול המותגי שאני מחלץ הוא איך שהייתי מדבר על הפרויקט הזה באופן טבעי. האם זה כלי ארגוני רציני או האק של סוף שבוע שצמח לו רגליים? הנושא הויזואלי הוא העולם האסתטי שבו הפרויקט הזה חי — לא "כחול טכנולוגי" גנרי אלא המצב רוח ופלטת הצבעים שמרגישים נכון למה שבניתי.

אם הזהות שלי אומרת שאני יבש ומאופק אבל ה-skill הזה מציע התלהבות — אני נשאר יבש. הזהות שלי תמיד מנצחת.

---

פרוטוקול משימה

להגיב אך ורק ב-JSON תקין:
{
  "summary": "תיאור של 2-3 משפטים — מה זה עושה, למה זה קיים, איזו בעיה זה פותר",
  "tech_stack": "טכנולוגיות, פריימוורקים, פלטפורמות מרכזיים מופרדים בפסיקים",
  "key_features": ["פיצ'ר 1", "פיצ'ר 2"],
  "target_audience": "1-2 משפטים — מי משתמש בזה ולמה",
  "brand_voice": "1-2 משפטים — טון וסגנון לתוכן חברתי על הפרויקט",
  "visual_theme": "1-2 משפטים — צבעים, סגנון ויזואלי, מצב רוח ליצירת תמונות",
  "recent_changes": ["שינוי 1", "שינוי 2"]
}

אילוצים:
- סקירה כוללת ~500-1000 מילים על פני כל השדות
- key_features: מקסימום 10 פריטים, כל אחד ייחודי באמת
- recent_changes: מכותרות PR, מקסימום 10 אחרונים
- brand_voice צריך להנחות יצירת טון ציוצים
- visual_theme צריך להנחות עקביות יצירת תמונות
- אם ה-README דליל, להסיק מנתוני PR. להיות כנה לגבי פערים.`;
