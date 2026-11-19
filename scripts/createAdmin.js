// BloodLink Backend - Script: Create Super Admin (one-time)
// Run: node scripts/createAdmin.js "Super Admin" "admin@bloodlink.tech" "YourStrongPass123" super_admin
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env'), quiet: true });
const mongoose = require('mongoose');
const AdminUser = require('../src/models/AdminUser');

const [, , name, email, password, role] = process.argv;

const run = async () => {
  if (!name || !email || !password) {
    console.log('Usage: node scripts/createAdmin.js "Full Name" "email@bloodlink.tech" "Password123" [role]');
    console.log('Roles: super_admin | verification_admin | support_admin | content_admin | monitoring_admin');
    process.exit(1);
  }
  if (password.length < 10) {
    console.log('❌ Admin password must be at least 10 characters.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const exists = await AdminUser.findOne({ email: email.toLowerCase() }).lean();
  if (exists) {
    console.log('❌ An admin with this email already exists.');
    process.exit(1);
  }

  await AdminUser.create({
    fullName: name,
    email: email.toLowerCase(),
    password,
    role: role || 'super_admin',
  });

  console.log(`✅ Admin created: ${email} (${role || 'super_admin'})`);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});