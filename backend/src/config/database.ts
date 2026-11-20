import mongoose from 'mongoose';
import { loadEnv } from './env';

loadEnv();

const connectDB = async (): Promise<boolean> => {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/welcometech-crm';
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      retryWrites: true,
    });
    console.log(`✅ MongoDB connected successfully to: ${mongoose.connection.host}/${mongoose.connection.name}`);
    return true;
  } catch (error: any) {
    console.error(`❌ MongoDB connection error (${error?.message || error})`);
    return false;
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️  MongoDB disconnected');
});

export default connectDB;
