import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { connectDB } from '../src/config/db.js';
import { AdminUser } from '../src/modules/admin/adminUser.model.js';

const email = (process.env.ADMIN_EMAIL || 'admin@bloodlink.tech').toLowerCase();
const password = process.env.ADMIN_PASSWORD || 'Admin@12345';

const run = async () => {
  await connectDB();

  const exists = await AdminUser.findOne({ email });
  if (exists) {
    console.log(`Admin already exists: ${email} — skipping.`);
  } else {
    await AdminUser.create({
      email,
      name: 'Super Admin',
      passwordHash: await bcrypt.hash(password, 12),
      role: 'superAdmin',
      status: 'active',
    });
    console.log(`✅ SuperAdmin created: ${email}`);
    console.log(`   Password: ${password}`);
    console.log('   ⚠️ লগইন করে অবশ্যই পাসওয়ার্ড বদলাবেন + 2FA চালু করবেন!');
  }

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});