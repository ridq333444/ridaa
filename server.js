const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
GOOGLE_CLIENT_ID="153916070041-ae540hnjni47qneo62r2loljhd3nd12k.apps.googleusercontent.com"
const app = express();
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

// Generate default SVGs for sample products if missing
const createDefaultSvg = (filename, text, bgColor, textColor) => {
  const filePath = path.join(uploadsDir, filename);
  if (!fs.existsSync(filePath)) {
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
      <rect width="400" height="400" fill="${bgColor}" rx="20" />
      <circle cx="200" cy="180" r="80" fill="none" stroke="${textColor}" stroke-width="4" opacity="0.3"/>
      <text x="50%" y="190" dominant-baseline="middle" text-anchor="middle" font-family="'Tajawal', sans-serif" font-size="28" font-weight="bold" fill="${textColor}">
        ${text}
      </text>
      <text x="50%" y="320" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="14" fill="${textColor}" opacity="0.6">
        مكتب رضا التقيي
      </text>
    </svg>`;
    fs.writeFileSync(filePath, svgContent);
  }
};

createDefaultSvg('default_iphone.svg', 'iPhone 15 Pro Max', '#1e1e24', '#e2e8f0');
createDefaultSvg('default_dell.svg', 'Dell XPS 13', '#0f172a', '#38bdf8');
createDefaultSvg('default_airpods.svg', 'AirPods Pro 2', '#1c1917', '#4ade80');
createDefaultSvg('default_charger.svg', 'Anker Nano 65W', '#172554', '#60a5fa');

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
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return [];
  }
}

function writeData(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
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

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp|svg/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only images are allowed!'));
  }
});

// Admin auth middleware
function requireAdmin(req, res, next) {
  const token = req.headers['authorization'];
  if (!token || !activeAdminSessions.has(token)) {
    return res.status(401).json({ error: 'غير مصرح بالدخول. يرجى تسجيل الدخول أولاً' });
  }
  req.adminUser = activeAdminSessions.get(token);
  next();
}

// Customer auth middleware (optional/soft checkout link or hard profile requirement)
function getCustomerIdFromToken(headers) {
  const token = headers['customer-authorization'] || headers['authorization'];
  if (token && activeCustomerSessions.has(token)) {
    return activeCustomerSessions.get(token); // returns customer email/id
  }
  return null;
}

// ----------------- ADMIN API ROUTES -----------------

// Login Endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'الرجاء إدخال اسم المستخدم وكلمة المرور' });
  }

  const users = readData(usersPath);
  const user = users.find(u => u.username === username && u.password === password);

  if (user) {
    const token = 'tok_adm_' + Math.round(Math.random() * 1e16).toString(36) + Date.now().toString(36);
    activeAdminSessions.set(token, username);
    res.json({ success: true, token, username });
  } else {
    res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }
});

app.get('/api/validate-token', (req, res) => {
  const token = req.headers['authorization'];
  if (token && activeAdminSessions.has(token)) {
    return res.json({ valid: true, username: activeAdminSessions.get(token) });
  }
  res.json({ valid: false });
});

// Get all products
app.get('/api/products', (req, res) => {
  const products = readData(productsPath);
  res.json(products);
});

// Add new product (Admin Only)
app.post('/api/products', requireAdmin, upload.single('image'), (req, res) => {
  const { title, description, price, stock, model } = req.body;
  
  if (!title || !price || !stock) {
    return res.status(400).json({ error: 'الرجاء ملء جميع الحقول المطلوبة (الاسم، السعر، الكمية)' });
  }

  const products = readData(productsPath);
  let imagePath = '/uploads/default_iphone.svg'; // Fallback
  if (req.file) {
    imagePath = '/uploads/' + req.file.filename;
  }

  const newProduct = {
    id: 'prod_' + Date.now(),
    title,
    description: description || '',
    price: parseFloat(price),
    stock: parseInt(stock),
    model: model || '',
    image: imagePath
  };

  products.push(newProduct);
  writeData(productsPath, products);
  res.status(201).json({ success: true, product: newProduct });
});

// Edit existing product (Admin Only)
app.put('/api/products/:id', requireAdmin, upload.single('image'), (req, res) => {
  const { id } = req.params;
  const { title, description, price, stock, model } = req.body;

  if (!title || !price || !stock) {
    return res.status(400).json({ error: 'الرجاء ملء جميع الحقول المطلوبة (الاسم، السعر، الكمية)' });
  }

  let products = readData(productsPath);
  const prodIndex = products.findIndex(p => p.id === id);

  if (prodIndex === -1) {
    return res.status(404).json({ error: 'المنتج غير موجود' });
  }

  const existingProduct = products[prodIndex];
  
  // Decide image path
  let imagePath = existingProduct.image;
  if (req.file) {
    imagePath = '/uploads/' + req.file.filename;
  }

  const updatedProduct = {
    id: existingProduct.id,
    title,
    description: description || '',
    price: parseFloat(price),
    stock: parseInt(stock),
    model: model || '',
    image: imagePath
  };

  products[prodIndex] = updatedProduct;
  writeData(productsPath, products);
  
  res.json({ success: true, product: updatedProduct });
});

// Delete product (Admin Only)
app.delete('/api/products/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  let products = readData(productsPath);
  const exists = products.some(p => p.id === id);

  if (!exists) {
    return res.status(404).json({ error: 'المنتج غير موجود' });
  }

  products = products.filter(p => p.id !== id);
  writeData(productsPath, products);
  res.json({ success: true, message: 'تم حذف المنتج بنجاح' });
});

// Get all orders (Admin Only)
app.get('/api/orders', requireAdmin, (req, res) => {
  const orders = readData(ordersPath);
  orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(orders);
});

// Update order status (Admin Only)
app.patch('/api/orders/:id/status', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'الرجاء تحديد الحالة الجديدة' });
  }

  const orders = readData(ordersPath);
  const order = orders.find(o => o.id === id);

  if (!order) {
    return res.status(404).json({ error: 'الطلب غير موجود' });
  }

  order.status = status;
  writeData(ordersPath, orders);
  res.json({ success: true, order });
});


// ----------------- CUSTOMER AUTH ROUTES -----------------

// Customer Register
app.post('/api/customer/google-login', (req, res) => {
  const { name, email, googleId, avatar, clientId } = req.body;

  if (!email || !name) {
    return res.status(400).json({ error: 'بيانات غير مكتملة من حساب جوجل' });
  }

  // هنا السيرفر راح يشيك المفتاح مالتك للتأكد من الأمان
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
      googleId: googleId || 'google_' + Date.now(),
      avatar: avatar || '',
      phone: '',
      createdAt: new Date().toISOString()
    };
    customers.push(customer);
    writeData(customersPath, customers);
  } else if (avatar && customer.avatar !== avatar) {
    customer.avatar = avatar;
    writeData(customersPath, customers);
  }

  const token = 'tok_cust_' + Math.round(Math.random() * 1e16).toString(36) + Date.now().toString(36);
  activeCustomerSessions.set(token, customer.id);

  res.json({ success: true, token, customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, avatar: customer.avatar } });
});
  const { name, email, password, phone } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'الرجاء ملء الاسم، البريد الإلكتروني، وكلمة المرور' });
  }

  const customers = readData(customersPath);
  const exists = customers.some(c => c.email.toLowerCase() === email.toLowerCase());

  if (exists) {
    return res.status(400).json({ error: 'البريد الإلكتروني مسجل بالفعل' });
  }

  const newCustomer = {
    id: 'cust_' + Date.now(),
    name,
    email: email.toLowerCase(),
    password, // Plain text for simplicity, in production we hash it
    phone: phone || '',
    avatar: '',
    createdAt: new Date().toISOString()
  };

  customers.push(newCustomer);
  writeData(customersPath, customers);

  const token = 'tok_cust_' + Math.round(Math.random() * 1e16).toString(36) + Date.now().toString(36);
  activeCustomerSessions.set(token, newCustomer.id);

  res.status(201).json({ success: true, token, customer: { id: newCustomer.id, name: newCustomer.name, email: newCustomer.email, phone: newCustomer.phone } });
});

// Customer Manual Login
app.post('/api/customer/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'الرجاء إدخال البريد الإلكتروني وكلمة المرور' });
  }

  const customers = readData(customersPath);
  const customer = customers.find(c => c.email.toLowerCase() === email.toLowerCase() && c.password === password);

  if (customer) {
    const token = 'tok_cust_' + Math.round(Math.random() * 1e16).toString(36) + Date.now().toString(36);
    activeCustomerSessions.set(token, customer.id);
    res.json({ success: true, token, customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, avatar: customer.avatar } });
  } else {
    res.status(401).json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' });
  }
});

// Customer Google Mock Login/Register
app.post('/api/customer/google-login', (req, res) => {
  const { name, email, googleId, avatar } = req.body;

  if (!email || !name) {
    return res.status(400).json({ error: 'بيانات غير مكتملة من حساب جوجل' });
  }

  const customers = readData(customersPath);
  let customer = customers.find(c => c.email.toLowerCase() === email.toLowerCase());

  if (!customer) {
    // Auto-register google user
    customer = {
      id: 'cust_g_' + googleId || Date.now(),
      name,
      email: email.toLowerCase(),
      googleId: googleId || 'google_' + Date.now(),
      avatar: avatar || '',
      phone: '',
      createdAt: new Date().toISOString()
    };
    customers.push(customer);
    writeData(customersPath, customers);
  } else if (avatar && customer.avatar !== avatar) {
    // Update avatar if changed
    customer.avatar = avatar;
    writeData(customersPath, customers);
  }

  const token = 'tok_cust_' + Math.round(Math.random() * 1e16).toString(36) + Date.now().toString(36);
  activeCustomerSessions.set(token, customer.id);

  res.json({ success: true, token, customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, avatar: customer.avatar } });
});

// Customer Profile + Order History
app.get('/api/customer/profile', (req, res) => {
  const token = req.headers['authorization'];
  if (!token || !activeCustomerSessions.has(token)) {
    return res.status(401).json({ error: 'انتهت الجلسة. يرجى تسجيل الدخول' });
  }

  const customerId = activeCustomerSessions.get(token);
  const customers = readData(customersPath);
  const customer = customers.find(c => c.id === customerId);

  if (!customer) {
    return res.status(404).json({ error: 'الحساب غير موجود' });
  }

  // Fetch orders linked to this customer
  const orders = readData(ordersPath);
  const customerOrders = orders.filter(o => o.customerId === customerId);

  res.json({
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      avatar: customer.avatar
    },
    orders: customerOrders
  });
});


// ----------------- CUSTOMER ORDER API -----------------

// Place new order
app.post('/api/orders', (req, res) => {
  const { customerName, governorate, phone, address, items, totalPrice } = req.body;

  if (!customerName || !governorate || !phone || !address || !items || !items.length) {
    return res.status(400).json({ error: 'الرجاء إكمال جميع معلومات التوصيل والطلب' });
  }

  const orders = readData(ordersPath);
  const products = readData(productsPath);

  // Validate stock and prepare order items
  const validatedItems = [];
  for (const item of items) {
    const product = products.find(p => p.id === item.productId);
    if (!product) {
      return res.status(400).json({ error: `المنتج ذو الرمز ${item.productId} غير متوفر` });
    }
    if (product.stock < item.quantity) {
      return res.status(400).json({ error: `الكمية المطلوبة من "${product.title}" غير متوفرة حالياً. المتبقي: ${product.stock}` });
    }
    validatedItems.push({
      productId: product.id,
      title: product.title,
      price: product.price,
      quantity: item.quantity,
      model: product.model
    });
  }

  // Deduct stock
  for (const item of items) {
    const product = products.find(p => p.id === item.productId);
    product.stock -= item.quantity;
  }
  writeData(productsPath, products);

  // Optionally link order to customer if logged in
  const customerId = getCustomerIdFromToken(req.headers);

  const newOrder = {
    id: 'ord_' + Date.now() + Math.floor(Math.random() * 100),
    customerId: customerId || null, // Linked to registered customer profile
    customerName,
    governorate,
    phone,
    address,
    items: validatedItems,
    totalPrice: parseFloat(totalPrice),
    status: 'جديد',
    createdAt: new Date().toISOString()
  };

  orders.push(newOrder);
  writeData(ordersPath, orders);

  res.status(201).json({ success: true, orderId: newOrder.id });
});

// Start listening
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
