const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const GOOGLE_CLIENT_ID = "153916070041-ae540hnjni47qneo62r2loljhd3nd12k.apps.googleusercontent.com";
const PORT = process.env.PORT || 3000;

// Setup directories
const dbDir = path.join(__dirname, 'db');
const uploadsDir = path.join(__dirname, 'uploads');
const publicDir = path.join(__dirname, 'public');

if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

// Setup database files if they don't exist
const productsPath = path.join(dbDir, 'products.json');
const ordersPath = path.join(dbDir, 'orders.json');
const usersPath = path.join(dbDir, 'users.json');
const customersPath = path.join(dbDir, 'customers.json');

if (!fs.existsSync(productsPath)) fs.writeFileSync(productsPath, JSON.stringify([], null, 2));
if (!fs.existsSync(ordersPath)) fs.writeFileSync(ordersPath, JSON.stringify([], null, 2));
if (!fs.existsSync(customersPath)) fs.writeFileSync(customersPath, JSON.stringify([], null, 2));
if (!fs.existsSync(usersPath)) {
  fs.writeFileSync(usersPath, JSON.stringify([{ username: 'admin', password: 'rida2026' }], null, 2));
}

// Setup Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));
app.use('/uploads', express.static(uploadsDir));

// In-memory session stores
const activeAdminSessions = new Map();
const activeCustomerSessions = new Map();

// Helper functions for DB reading & writing
function readData(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

function writeData(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    return false;
  }
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'product-' + uniqueSuffix + ext);
  }
});

const upload = multer({ storage: storage });

// Admin auth middleware
function requireAdmin(req, res, next) {
  const token = req.headers['authorization'];
  if (!token || !activeAdminSessions.has(token)) {
    return res.status(401).json({ error: 'غير مصرح بالدخول' });
  }
  req.adminUser = activeAdminSessions.get(token);
  next();
}

function getCustomerIdFromToken(headers) {
  const token = headers['customer-authorization'] || headers['authorization'];
  if (token && activeCustomerSessions.has(token)) {
    return activeCustomerSessions.get(token); 
  }
  return null;
}

// ----------------- ROUTES -----------------

app.get('/', (req, res) => {
  res.send('سيرفر مكتب رضا التقيي يعمل بنجاح على Glitch!');
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = readData(usersPath);
  const user = users.find(u => u.username === username && u.password === password);

  if (user) {
    const token = 'tok_adm_' + Math.round(Math.random() * 1e16).toString(36);
    activeAdminSessions.set(token, username);
    res.json({ success: true, token, username });
  } else {
    res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }
});

app.get('/api/products', (req, res) => {
  res.json(readData(productsPath));
});

app.post('/api/customer/google-login', (req, res) => {
  const { name, email, googleId, avatar, clientId } = req.body;

  if (!email || !name) {
    return res.status(400).json({ error: 'بيانات غير مكتملة' });
  }

  if (clientId && clientId !== GOOGLE_CLIENT_ID) {
    console.warn("تنبيه: معرف العميل غير متطابق!");
  }

  const customers = readData(customersPath);
  let customer = customers.find(c => c.email.toLowerCase() === email.toLowerCase());

  if (!customer) {
    customer = {
      id: 'cust_g_' + (googleId || Date.now()),
      name,
      email: email.toLowerCase(),
      avatar: avatar || '',
      phone: '',
      createdAt: new Date().toISOString()
    };
    customers.push(customer);
    writeData(customersPath, customers);
  }

  const token = 'tok_cust_' + Math.round(Math.random() * 1e16).toString(36);
  activeCustomerSessions.set(token, customer.id);

  res.json({ success: true, token, customer });
});

app.post('/api/orders', (req, res) => {
  const { customerName, governorate, phone, address, items, totalPrice } = req.body;
  const orders = readData(ordersPath);

  const newOrder = {
    id: 'ord_' + Date.now(),
    customerName,
    governorate,
    phone,
    address,
    items,
    totalPrice,
    status: 'جديد',
    createdAt: new Date().toISOString()
  };

  orders.push(newOrder);
  writeData(ordersPath, orders);
  res.status(201).json({ success: true, orderId: newOrder.id });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
