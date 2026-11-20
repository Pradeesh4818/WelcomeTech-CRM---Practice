import { loadEnv } from '../config/env';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User';

loadEnv();
import Customer from '../models/Customer';
import { AMC } from '../models/index';
import Product from '../models/Product';

const seed = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/welcometech-crm';
  await mongoose.connect(uri);
  console.log(`Connected to MongoDB: ${uri}`);

  const db = mongoose.connection.db;
  if (!db) throw new Error('Database not found');

  // Purge all collections in the database
  const collections = await db.listCollections().toArray();
  for (const collection of collections) {
    await db.collection(collection.name).deleteMany({});
    console.log(`Purged collection: ${collection.name}`);
  }

  // Create default Super Admin user
  const admin = await User.create({
    name: 'WelcomeTech Admin',
    email: 'admin@welcometech.qa',
    password: 'Admin@123#',
    role: 'admin',
    isActive: true,
  });

  console.log('✅ Staging Database Reset & Sole Super Admin Created!');
  console.log('───────────────────────────────────────────────────');
  console.log('Email:    admin@welcometech.qa');
  console.log('Password: Admin@123#');
  console.log('Role:     admin');
  console.log('───────────────────────────────────────────────────');
  process.exit(0);
};

seed().catch((err) => { console.error(err); process.exit(1); });
