const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");

const { train, predict, addTrainingData } = require("./model/train");
const fetchEmails = require("./emailFetcher");

const app = express();
app.use(bodyParser.json());

// ✅ CORS
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }
    next();
});

// ✅ Serve Frontend
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// ✅ Train model once
train();
console.log("✅ Naive Bayes Model Trained Successfully!");

// ------------------- SAVE HISTORY -------------------
function saveHistory(entry) {
    let history = [];

    if (fs.existsSync("history.json")) {
        try {
            const fileData = fs.readFileSync("history.json", "utf8");
            history = fileData.trim() ? JSON.parse(fileData) : [];
        } catch {
            history = [];
        }
    }

    history.unshift(entry);
    fs.writeFileSync("history.json", JSON.stringify(history, null, 2));
}

// ------------------- TRUSTED DOMAINS FILE -------------------
const trustedFilePath = path.join(__dirname, "trustedDomains.json");

function readTrustedDomains() {
    try {
        if (!fs.existsSync(trustedFilePath)) {
            fs.writeFileSync(trustedFilePath, JSON.stringify([], null, 2));
        }

        const data = fs.readFileSync(trustedFilePath, "utf8");
        return data.trim() ? JSON.parse(data) : [];
    } catch (err) {
        console.log("❌ Trusted Domain File Error:", err.message);
        return [];
    }
}

function saveTrustedDomains(domains) {
    try {
        fs.writeFileSync(trustedFilePath, JSON.stringify(domains, null, 2));
    } catch (err) {
        console.log("❌ Error Saving Trusted Domains:", err.message);
    }
}

// ------------------- API: GET TRUSTED DOMAINS -------------------
app.get("/trusted-domains", (req, res) => {
    const domains = readTrustedDomains();
    res.json(domains);
});

// ------------------- API: ADD TRUSTED DOMAIN -------------------
app.post("/trusted-domains", (req, res) => {
    try {
        const { domain } = req.body;

        if (!domain || domain.trim() === "") {
            return res.status(400).json({ error: "Domain is required!" });
        }

        let domains = readTrustedDomains();
        const cleanDomain = domain.trim().toLowerCase();

        if (!domains.includes(cleanDomain)) {
            domains.push(cleanDomain);
        }

        saveTrustedDomains(domains);

        res.json({ message: "Domain added successfully!", domains });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ------------------- API: DELETE TRUSTED DOMAIN -------------------
app.delete("/trusted-domains/:domain", (req, res) => {
    try {
        const domainToDelete = req.params.domain.toLowerCase();

        let domains = readTrustedDomains();
        domains = domains.filter(d => d !== domainToDelete);

        saveTrustedDomains(domains);

        res.json({ message: "Domain removed successfully!", domains });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ------------------- API: CHECK EMAIL -------------------
app.post("/check", (req, res) => {
    try {
        const { email } = req.body;

        if (!email || email.trim() === "") {
            return res.json({
                result: "EMPTY",
                spamProbability: "0.00",
                hamProbability: "0.00",
                topWords: [],
                links: [],
                suspiciousLinks: [],
                riskScore: 0
            });
        }

        const prediction = predict(email);

        saveHistory({
            email,
            result: prediction.result,
            spamProbability: prediction.spamProbability,
            hamProbability: prediction.hamProbability,
            time: new Date().toLocaleString()
        });

        // ✅ FIX: Always return correct structure
        res.json({
            result: prediction.result,
            spamProbability: prediction.spamProbability,
            hamProbability: prediction.hamProbability,
            topWords: prediction.topWords || [],
            links: prediction.links || [],
            suspiciousLinks: prediction.suspiciousLinks || [],
            riskScore: prediction.riskScore || 0
        });

    } catch (err) {
        console.log("❌ /check ERROR:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// ------------------- API: HISTORY -------------------
app.get("/history", (req, res) => {
    try {
        if (!fs.existsSync("history.json")) return res.json([]);

        const data = fs.readFileSync("history.json", "utf8");
        if (data.trim() === "") return res.json([]);

        res.json(JSON.parse(data));
    } catch {
        res.json([]);
    }
});

// ------------------- API: CLEAR HISTORY -------------------
app.delete("/history", (req, res) => {
    try {
        fs.writeFileSync("history.json", "[]");
        res.json({ message: "History cleared successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ------------------- API: FEEDBACK -------------------
app.post("/feedback", (req, res) => {
    try {
        const { email, label } = req.body;

        if (!email || !label) {
            return res.json({ message: "Missing email or label!" });
        }

        addTrainingData(label, email);

        res.json({ message: `Email added as ${label} and model retrained!` });

    } catch (err) {
        console.log("❌ /feedback ERROR:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// ------------------- API: FETCH INBOX -------------------
app.get("/inbox", async (req, res) => {
    try {
        console.log("🔥 /inbox API HIT");

        const inboxEmails = await fetchEmails();

        console.log("✅ Emails fetched:", inboxEmails.length);

        if (!inboxEmails || inboxEmails.length === 0) {
            return res.json([]);
        }

        const results = inboxEmails.map(mail => {
            const fullText = `${mail.subject} ${mail.text}`;
            const prediction = predict(fullText);

            return {
                from: mail.from,
                subject: mail.subject,
                date: mail.date,
                result: prediction.result,
                spamProbability: prediction.spamProbability,
                hamProbability: prediction.hamProbability,
                riskScore: prediction.riskScore || 0
            };
        });

        res.json(results);

    } catch (err) {
        console.log("❌ /inbox ERROR:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// ------------------- SERVER START -------------------
app.listen(3000, () => {
    console.log("🚀 Server running at http://localhost:3000");
    console.log("📩 Inbox URL: http://localhost:3000/inbox");
    console.log("📌 Trusted Domains URL: http://localhost:3000/trusted-domains");
});