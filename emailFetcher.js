process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const Imap = require("imap-simple");
const { simpleParser } = require("mailparser");
require("dotenv").config();

let isFetching = false;
let cachedEmails = [];
let lastFetchTime = 0;

async function fetchEmails() {

    const now = Date.now();

    if (cachedEmails.length > 0 && (now - lastFetchTime) < 30000) {
        console.log("⚡ Returning Cached Inbox Emails...");
        return cachedEmails;
    }

    if (isFetching) {
        console.log("⏳ Inbox fetch already running...");
        return cachedEmails;
    }

    isFetching = true;

    const config = {
        imap: {
            user: process.env.EMAIL,
            password: process.env.PASSWORD,
            host: "imap.gmail.com",
            port: 993,
            tls: true,
            authTimeout: 30000,
            connTimeout: 30000,
            tlsOptions: {
                rejectUnauthorized: false
            }
        }
    };

    let connection;

    try {

        console.log("📩 Connecting to Gmail...");
        console.log("📧 Email:", process.env.EMAIL);
        console.log(
            "🔑 Password Length:",
            process.env.PASSWORD ? process.env.PASSWORD.length : 0
        );

        connection = await Imap.connect(config);

        console.log("✅ Connected to Gmail!");

        await connection.openBox("INBOX");

        console.log("📂 Inbox opened!");

        const searchCriteria = ["ALL"];

        const fetchOptions = {
            bodies: ["HEADER", "TEXT"],
            markSeen: false
        };

        const results = await connection.search(
            searchCriteria,
            fetchOptions
        );

        console.log("📨 Total Emails:", results.length);

        const last10 = results.slice(-10);

        const emails = [];

        for (const item of last10) {

            const headerPart = item.parts.find(
                p => p.which === "HEADER"
            );

            const bodyPart = item.parts.find(
                p => p.which === "TEXT"
            );

            const header = headerPart ? headerPart.body : {};

            let textBody = "";

            if (bodyPart && bodyPart.body) {
                try {
                    const parsed = await simpleParser(bodyPart.body);
                    textBody = parsed.text || "";
                } catch {
                    textBody = bodyPart.body.toString();
                }
            }

            emails.push({
                from: header.from
                    ? header.from[0]
                    : "Unknown",

                subject: header.subject
                    ? header.subject[0]
                    : "No Subject",

                date: header.date
                    ? header.date[0]
                    : "No Date",

                text: textBody.substring(0, 500)
            });
        }

        connection.end();

        cachedEmails = emails.reverse();
        lastFetchTime = Date.now();

        console.log(
            "✅ Emails fetched:",
            cachedEmails.length
        );

        return cachedEmails;

    } catch (err) {

        console.log("❌ Gmail Error:");
        console.log(err);

        try {
            if (connection) {
                connection.end();
            }
        } catch {}

        return [];

    } finally {

        isFetching = false;
    }
}

module.exports = fetchEmails;