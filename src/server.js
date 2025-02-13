const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const admin = require("firebase-admin");
const puppeteer = require("puppeteer");
require("dotenv").config();

// Initialize Firebase Admin SDK
const serviceAccount = require("../dj-seo-dashboard-firebase-adminsdk-fbsvc-2c9cdb2f68.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://dj-seo-dashboard.firebaseio.com",
});

const db = admin.firestore();
const app = express();
const PORT = 8009;

app.use(bodyParser.json());
// Cors Policy
// For production
app.use(
  cors({
    origin: [
      "https://seo-dashboard-client.digitalmarketinglucknow.com",
      "https://seo-dashboard-admin.digitalmarketinglucknow.com",
      "http://localhost:3000",
    ],
  })
);
app.options("*", cors());
// For Development
// app.use(cors());

/** Admin Login (Firebase Auth) */
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Email and password are required" });

  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    const userDoc = await db.collection("users").doc(userRecord.uid).get();

    if (!userDoc.exists)
      return res.status(404).json({ message: "User not found in database" });

    res.status(200).json({
      message: "Login successful",
      uid: userRecord.uid,
      role: userDoc.data().role,
    });
  } catch (error) {
    res
      .status(401)
      .json({ message: "Invalid credentials", error: error.message });
  }
});

/** Admin: Create New Admin */
app.post("/register-admin", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ message: "All fields are required." });

  try {
    const userRecord = await admin
      .auth()
      .createUser({ email, password, displayName: name });
    await db.collection("users").doc(userRecord.uid).set({
      name,
      email,
      role: "admin",
      createdAt: new Date().toISOString(),
    });
    res
      .status(201)
      .json({ message: "Admin registered successfully", uid: userRecord.uid });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating admin", error: error.message });
  }
});

/** Admin: Create New Client User */
app.post("/create-user", async (req, res) => {
  const { name, email, password, projectName, projectStatus } = req.body;
  if (!name || !email || !password || !projectName || !projectStatus)
    return res.status(400).json({ message: "All fields are required." });

  try {
    const userRecord = await admin
      .auth()
      .createUser({ email, password, displayName: name });
    const userRef = db.collection("users").doc(userRecord.uid);
    await userRef.set({
      name,
      email,
      role: "client",
      createdAt: new Date().toISOString(),
    });

    // Store project under 'projects' subcollection
    await userRef.collection("projects").doc("default").set({
      projectName,
      projectStatus,
      createdAt: new Date().toISOString(),
    });

    res
      .status(201)
      .json({ message: "Client created successfully", uid: userRecord.uid });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error creating user", error: error.message });
  }
});

/** Get All Clients */
app.get("/users", async (req, res) => {
  try {
    const usersSnapshot = await db
      .collection("users")
      .where("role", "==", "client")
      .get();

    if (usersSnapshot.empty)
      return res.status(404).json({ message: "No clients found" });

    const users = await Promise.all(
      usersSnapshot.docs.map(async (doc) => {
        const userData = doc.data();

        // Fetch projects for the client (reducing Firestore reads)
        const projectsSnapshot = await doc.ref.collection("projects").get();
        const projects = projectsSnapshot.docs.map((proj) => ({
          id: proj.id,
          ...proj.data(),
        }));

        return { id: doc.id, ...userData, projects }; // Ensure a uniform response structure
      })
    );

    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching clients:", error);
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
});

/** Get a Single User (Client) */
app.get("/users/:id", async (req, res) => {
  try {
    const userDoc = await db.collection("users").doc(req.params.id).get();
    if (!userDoc.exists)
      return res.status(404).json({ message: "User not found" });
    res.json({ id: userDoc.id, ...userDoc.data() });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching user", error: error.message });
  }
});

/** Update Project Details (Client) */
app.put("/users/:id", async (req, res) => {
  const { id } = req.params;
  let { projectName, projectDetail, projectStatus, siteUrl, keywords } =
    req.body;

  try {
    // Ensure values are not undefined
    const updateData = {};
    if (projectName !== undefined) updateData.projectName = projectName;
    if (projectDetail !== undefined) updateData.projectDetail = projectDetail;
    if (projectStatus !== undefined) updateData.projectStatus = projectStatus;
    if (siteUrl !== undefined) updateData.siteUrl = siteUrl;
    if (keywords !== undefined)
      updateData.keywords = keywords.split(",").map((kw) => kw.trim());

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    // Reference to 'default' project under user's 'projects' subcollection
    const projectRef = db
      .collection("users")
      .doc(id)
      .collection("projects")
      .doc("default");
    await projectRef.set(updateData, { merge: true });

    res.json({ message: "Project updated successfully" });
  } catch (error) {
    console.error("Error updating project:", error);
    res
      .status(500)
      .json({ message: "Error updating project", error: error.message });
  }
});

/** Get Rankings for a Client Project */
app.get("/rankings/:id", async (req, res) => {
  try {
    const projectRef = db
      .collection("users")
      .doc(req.params.id)
      .collection("projects")
      .doc("default");
    const projectDoc = await projectRef.get();

    if (!projectDoc.exists)
      return res.status(404).json({ message: "Project not found" });
    res.json({ rankings: projectDoc.data().rankings || [] });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching rankings", error: error.message });
  }
});

/** Fetch and Scrape Google Rankings */
const getRanking = async (keyword, siteUrl) => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(
    `https://www.google.com/search?q=${encodeURIComponent(keyword)}`
  );
  const results = await page.evaluate(() =>
    [...document.querySelectorAll("div.tF2Cxc a")].map((a) => a.href)
  );
  await browser.close();
  return results.findIndex((url) => url.includes(siteUrl)) + 1 || "Not found";
};

/** Scrape and Store Rankings */
app.get("/scrape-rankings/:id", async (req, res) => {
  try {
    const projectRef = db
      .collection("users")
      .doc(req.params.id)
      .collection("projects")
      .doc("default");
    const projectDoc = await projectRef.get();
    if (!projectDoc.exists)
      return res.status(404).json({ message: "Project not found" });

    const { siteUrl, keywords = [] } = projectDoc.data();
    if (!siteUrl || keywords.length === 0)
      return res.status(400).json({ message: "Missing site URL or keywords" });

    const rankings = await Promise.all(
      keywords.map(async (keyword) => ({
        keyword,
        position: await getRanking(keyword, siteUrl),
      }))
    );
    await projectRef.update({ rankings });
    res.json({ message: "Rankings updated", rankings });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching rankings", error: error.message });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
