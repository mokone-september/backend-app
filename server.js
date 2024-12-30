require("dotenv").config()
const jwt = require("jsonwebtoken")
const marked = require("marked")
const sanitizeHTML = require("sanitize-html")
const bcrypt = require("bcrypt")
const cookieParser = require("cookie-parser")
const express = require("express")
const db = require("better-sqlite3")("ourApp.db")
db.pragma("journal_mode = WAL")

// Create tables if they don't exist
const createTables = db.transaction(() => {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username STRING NOT NULL UNIQUE,
      password STRING NOT NULL
    )
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      createdDate TEXT,
      title STRING NOT NULL,
      body TEXT NOT NULL,
      authorid INTEGER,
      FOREIGN KEY (authorid) REFERENCES users (id)
    )
  `).run()
})
createTables()

const app = express()

app.set("view engine", "ejs")
app.use(express.urlencoded({ extended: false }))
app.use(express.static("public"))
app.use(cookieParser())

app.use(function (req, res, next) {
  res.locals.filterUserHTML = function (content) {
    return sanitizeHTML(marked.parse(content), {
      allowedTags: ["p", "br", "ul", "li", "ol", "strong", "bold", "i", "em", "h1", "h2", "h3", "h4", "h5", "h6"],
      allowedAttributes: {}
    })
  }

  res.locals.errors = []

  try {
    const decoded = jwt.verify(req.cookies.ourSimpleApp, process.env.JWTSECRET)
    req.user = decoded
  } catch (err) {
    req.user = false
  }

  res.locals.user = req.user
  next()
})

app.get("/", (req, res) => {
  if (req.user) {
    return res.render("dashboard", { posts: [] }) // Temporarily no posts
  }
  res.render("homepage")
})

app.get("/login", (req, res) => {
  res.render("login")
})

app.get("/logout", (req, res) => {
  res.clearCookie("ourSimpleApp")
  res.redirect("/")
})

app.post("/login", (req, res) => {
  let errors = []

  if (typeof req.body.username !== "string") req.body.username = ""
  if (typeof req.body.password !== "string") req.body.password = ""

  if (req.body.username.trim() == "") errors.push("Invalid username / password.")
  if (req.body.password == "") errors.push("Invalid username / password.")

  if (errors.length) {
    return res.render("login", { errors })
  }

  // Temporarily bypassing user verification
  const ourTokenValue = jwt.sign(
    { exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, skyColor: "blue", userid: 1, username: req.body.username },
    process.env.JWTSECRET
  )

  res.cookie("ourSimpleApp", ourTokenValue, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 1000 * 60 * 60 * 24
  })

  res.redirect("/")
})

function mustBeLoggedIn(req, res, next) {
  if (req.user) {
    return next()
  }
  return res.redirect("/")
}

app.get("/create-post", mustBeLoggedIn, (req, res) => {
  res.render("create-post")
})

function sharedPostValidation(req) {
  const errors = []
  if (typeof req.body.title !== "string") req.body.title = ""
  if (typeof req.body.body !== "string") req.body.body = ""

  req.body.title = sanitizeHTML(req.body.title.trim(), { allowedTags: [], allowedAttributes: {} })
  req.body.body = sanitizeHTML(req.body.body.trim(), { allowedTags: [], allowedAttributes: {} })

  if (!req.body.title) errors.push("You must provide a title.")
  if (!req.body.body) errors.push("You must provide content.")

  return errors
}

app.post("/register", (req, res) => {
  const errors = []

  if (typeof req.body.username !== "string") req.body.username = ""
  if (typeof req.body.password !== "string") req.body.password = ""

  req.body.username = req.body.username.trim()

  if (!req.body.username) errors.push("You must provide a username.")
  if (req.body.username.length < 3) errors.push("Username must be at least 3 characters.")
  if (req.body.username.length > 10) errors.push("Username cannot exceed 10 characters.")
  if (!req.body.username.match(/^[a-zA-Z0-9]+$/)) errors.push("Username can only contain letters and numbers.")

  if (!req.body.password) errors.push("You must provide a password.")
  if (req.body.password.length < 10) errors.push("Password must be at least 10 characters.")
  if (req.body.password.length > 70) errors.push("Password cannot exceed 70 characters.")

  if (errors.length) {
    return res.render("homepage", { errors })
  }

  const salt = bcrypt.genSaltSync(10)
  req.body.password = bcrypt.hashSync(req.body.password, salt)

  const ourTokenValue = jwt.sign(
    { exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, skyColor: "blue", userid: 1, username: req.body.username },
    process.env.JWTSECRET
  )

  res.cookie("ourSimpleApp", ourTokenValue, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 1000 * 60 * 60 * 24
  })

  res.redirect("/")
})

app.listen(3000)
