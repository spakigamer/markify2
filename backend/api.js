import express from 'express';
import bodyParser from 'body-parser';
import session from 'express-session';
import passport from 'passport';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcrypt';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import MongoStore from "connect-mongo";

dotenv.config();
const app = express();
const PORT = 3000;
const saltRounds = 10;

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds
  })

// Schemas
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  googleId: String,
});

const noteSchema = new mongoose.Schema({
  email: String,
  marktext: String,
  title: String,
  description: String,
});

const User = mongoose.model('User', userSchema);
const Note = mongoose.model('Note', noteSchema);

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  methods: 'GET,POST,PUT,DELETE',
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
          user: process.env.EMAIL, 
          pass: process.env.PASSWORD,
      },
      debug: true, // Enable debugging
      logger: true, // Log email sending process
    });

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI, // Use your MongoDB connection
      ttl: 14 * 24 * 60 * 60, // Sessions expire in 14 days
    }),
  })
);

app.use(passport.initialize());

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized, token missing' });

  jwt.verify(token, process.env.SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Passport Strategies
passport.use(new LocalStrategy({ usernameField: 'email', passwordField: 'password' }, async (email, password, cb) => {
  try {
    const user = await User.findOne({ email });
    if (!user) return cb(null, false, { message: 'User not found' });

    const valid = await bcrypt.compare(password, user.password,(err,result)=>{
      return  result
    });
    return cb(null, valid ? user : false, { message: 'Invalid credentials' });
  } catch (err) {
    return cb(err);
  }
}));

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: 'http://localhost:3000/auth/google/secrets',
}, async (accessToken, refreshToken, profile, cb) => {
  try {
    let user = await User.findOne({ email: profile.emails[0].value });
    if (!user) {
      user = new User({
        name: profile.displayName,
        email: profile.emails[0].value,
        googleId: profile.id,
      });
      await user.save();
    }
    return cb(null, user);
  } catch (err) {
    return cb(err);
  }
}));

passport.serializeUser((user, cb) => cb(null, user.id));
passport.deserializeUser(async (id, cb) => {
  const user = await User.findById(id);
  cb(null, user);
});

// Authentication Routes
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/secrets', passport.authenticate('google', { failureRedirect: '/login' }), (req, res) => {
  const token = jwt.sign({ id: req.user.id, email: req.user.email }, process.env.SECRET_KEY);
  res.redirect(`http://localhost:5173/dashboard?token=${token}`);
});

app.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    console.log("Request Body:", req.body);

    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    const saltRounds = 10; // Ensure saltRounds is defined

    bcrypt.hash(password, saltRounds, async (err, hashedPassword) => {
      if (err) {
        console.error("Bcrypt error:", err);
        return res.status(500).json({ message: "Error hashing password" });
      }

      const user = new User({ name, email, password: hashedPassword });
      await user.save();

      const token = jwt.sign(
        { id: user.id, email: user.email },
        process.env.SECRET_KEY,
        { expiresIn: "1h" }
      );

      res.json({ token, message: "Registration successful!" });
    });

  } catch (error) {
    console.error("Error in /register:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/contact", (req, res) => {
  const { name, email, topic, problem } = req.body;

  if (!name || !email || !topic || !problem) {
      return res.status(400).json({ message: "All fields are required" });
  }

  const mailOptions = {
      from: process.env.EMAIL, // Ensure this is your configured email
      to: process.env.EMAIL,   // Your email to receive complaints
      subject: `Complaint topic: ${topic}`,
      text: `Name: ${name}\nEmail: ${email}\nProblem: ${problem}`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
          console.error("Error sending email:", error);
          return res.status(500).json({ message: "Email sending failed", error: error.toString() });
      }
      res.status(200).json({ message: "Email sent successfully" });
  });
});

app.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return res.status(500).json({ message: 'Internal Server Error' });
    if (!user) return res.status(401).json({ message: info.message });

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.SECRET_KEY);
    res.json({ token, message: 'Login successful!' });
  })(req, res, next);
});

// CRUD Operations for Notes
app.post('/add', authenticateToken, async (req, res) => {
  const { marktext, title, description } = req.body;
  const note = new Note({ email: req.user.email, marktext, title, description });
  await note.save();
  res.json({ message: 'ok', note });
});

app.put('/add', authenticateToken, async (req, res) => {
  const { id, marktext, title, description } = req.body;
  const note = await Note.findByIdAndUpdate(id, { marktext, title, description }, { new: true });
  res.json({ message: 'ok', note });
});

app.get('/get-data', authenticateToken, async (req, res) => {
  const notes = await Note.find({ email: req.user.email }, '_id title description');
  res.json({ message: 'ok', data: notes });
});

app.post('/search', authenticateToken, async (req, res) => {
  const note = await Note.findById(req.body._id);
  res.json(note ? { resultsgot: note, message: 'true' } : { message: 'false' });
});

app.listen(PORT,() => {
  console.log(`Server running on port ${PORT}`);
});
