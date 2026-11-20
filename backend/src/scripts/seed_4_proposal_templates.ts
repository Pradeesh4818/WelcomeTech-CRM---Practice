import mongoose from 'mongoose';
import { ProposalTemplate } from '../models/index';
import User from '../models/User';
import { loadEnv } from '../config/env';

loadEnv();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/welcometech-crm';

async function seedProposalTemplates() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);

    let user = await User.findOne({ role: { $in: ['admin', 'super_admin'] } });
    if (!user) {
      user = await User.findOne({});
    }

    if (!user) {
      console.error('No user found in database to assign createdBy to proposal templates.');
      process.exit(1);
    }

    console.log(`Using user ID: ${user._id} (${user.name})`);

    const templates = [
      {
        name: 'Lorry Transport & Freight Logistics Package',
        title: 'Lorry Freight & Heavy Transport Services Proposal',
        validForDays: 10,
        discount: 5,
        templateImage: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='100' viewBox='0 0 800 100'><rect width='800' height='100' fill='%236366f1' rx='8'/><text x='30' y='55' fill='white' font-family='sans-serif' font-size='24' font-weight='800'>WELCOME TECH TRANSPORT LOGISTICS</text><text x='30' y='80' fill='%23e0e7ff' font-family='sans-serif' font-size='14'>Premier Heavy Haulage &amp; Cargo Freight Solutions</text></svg>",
        templateFooterImage: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='60' viewBox='0 0 800 60'><rect width='800' height='60' fill='%231e293b' rx='6'/><text x='400' y='35' fill='%2394a3b8' font-family='sans-serif' font-size='12' text-anchor='middle'>Welcome Tech CRM • Technology Park Malaysia, Bukit Jalil, KL • Tel: +603-8888 9999 • sales@welcometech.com</text></svg>",
        items: [
          {
            description: '10 Ton Curtain-Sider Lorry Cargo Transport Service',
            qty: 2,
            unitPrice: 3500,
            total: 7000
          },
          {
            description: 'Professional Loading & Unloading Rigging Assistance',
            qty: 1,
            unitPrice: 850,
            total: 850
          },
          {
            description: 'Interstate Highway Toll & Permit Handling Surcharge',
            qty: 1,
            unitPrice: 450,
            total: 450
          }
        ],
        terms: "1. Valid for 10 days from quotation date.\n2. 50% advance upon booking, 50% upon delivery.\n3. Goods transit insurance coverage included up to RM 100,000.",
        createdBy: user._id,
        isActive: true
      },
      {
        name: 'Commercial Fleet Painting & Refurbishment',
        title: 'Fleet Painting & Anti-Corrosion Refurbishment Proposal',
        validForDays: 14,
        discount: 8,
        templateImage: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='100' viewBox='0 0 800 100'><rect width='800' height='100' fill='%23059669' rx='8'/><text x='30' y='55' fill='white' font-family='sans-serif' font-size='24' font-weight='800'>WELCOME TECH FLEET FINISHING</text><text x='30' y='80' fill='%23d1fae5' font-family='sans-serif' font-size='14'>Industrial Coating &amp; Fleet Custom Livery Services</text></svg>",
        templateFooterImage: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='60' viewBox='0 0 800 60'><rect width='800' height='60' fill='%23064e3b' rx='6'/><text x='400' y='35' fill='%23a7f3d0' font-family='sans-serif' font-size='12' text-anchor='middle'>Welcome Tech CRM Industrial Services • High-Durability Epoxy &amp; Polyurethane Fleet Coatings</text></svg>",
        items: [
          {
            description: 'Full Vehicle Exterior Sandblasting & Surface Primer',
            qty: 3,
            unitPrice: 2200,
            total: 6600
          },
          {
            description: 'Premium Polyurethane Metallic Paint & Custom Decal Coating',
            qty: 3,
            unitPrice: 3800,
            total: 11400
          },
          {
            description: 'Anti-Rust Underbody Protection & High-Gloss Sealant',
            qty: 3,
            unitPrice: 950,
            total: 2850
          }
        ],
        terms: "1. Quotation valid for 14 days.\n2. 3-Year Anti-Peel Warranty on all polyurethane coatings.\n3. Work completed within 7 business days per vehicle.",
        createdBy: user._id,
        isActive: true
      },
      {
        name: 'IT Infrastructure & Cloud AMC Package',
        title: 'Annual IT Hardware & Cloud Maintenance Agreement',
        validForDays: 30,
        discount: 10,
        templateImage: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='100' viewBox='0 0 800 100'><rect width='800' height='100' fill='%237c3aed' rx='8'/><text x='30' y='55' fill='white' font-family='sans-serif' font-size='24' font-weight='800'>WELCOME TECH IT SOLUTION SERVICES</text><text x='30' y='80' fill='%23ede9fe' font-family='sans-serif' font-size='14'>24/7 Managed IT Infrastructure, Cloud &amp; Cybersecurity</text></svg>",
        templateFooterImage: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='60' viewBox='0 0 800 60'><rect width='800' height='60' fill='%234c1d95' rx='6'/><text x='400' y='35' fill='%23ddd6fe' font-family='sans-serif' font-size='12' text-anchor='middle'>Welcome Tech Cloud &amp; IT AMC • SLA Guaranteed 99.9% Uptime Support</text></svg>",
        items: [
          {
            description: 'Enterprise Server & Network Monitoring SLA (Monthly)',
            qty: 12,
            unitPrice: 1500,
            total: 18000
          },
          {
            description: 'Automated Cloud Backup & Disaster Recovery Storage (5TB)',
            qty: 12,
            unitPrice: 800,
            total: 9600
          },
          {
            description: 'On-Site Technical Engineer Visits (Up to 4 calls/month)',
            qty: 12,
            unitPrice: 1200,
            total: 14400
          }
        ],
        terms: "1. Contract duration: 12 months.\n2. Billed quarterly in advance.\n3. Guaranteed 2-hour response time for critical server incidents.",
        createdBy: user._id,
        isActive: true
      },
      {
        name: 'Warehouse Storage & Distribution Contract',
        title: '3PL Warehouse Warehousing & Order Fulfillment Proposal',
        validForDays: 15,
        discount: 0,
        templateImage: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='100' viewBox='0 0 800 100'><rect width='800' height='100' fill='%23d97706' rx='8'/><text x='30' y='55' fill='white' font-family='sans-serif' font-size='24' font-weight='800'>WELCOME TECH WAREHOUSING &amp; 3PL</text><text x='30' y='80' fill='%23fef3c7' font-family='sans-serif' font-size='14'>Temperature-Controlled Storage &amp; Order Fulfillment</text></svg>",
        templateFooterImage: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='800' height='60' viewBox='0 0 800 60'><rect width='800' height='60' fill='%2378350f' rx='6'/><text x='400' y='35' fill='%23fde68a' font-family='sans-serif' font-size='12' text-anchor='middle'>Welcome Tech Logistics Center • Shah Alam Hub • Storage, Pick &amp; Pack, Last-Mile Delivery</text></svg>",
        items: [
          {
            description: 'Pallet Racking Storage Space (50 Pallet Positions / Month)',
            qty: 6,
            unitPrice: 2500,
            total: 15000
          },
          {
            description: 'WMS Real-Time Barcode Inventory Tracking System License',
            qty: 1,
            unitPrice: 1800,
            total: 1800
          },
          {
            description: 'Pick, Pack & Dispatch Handling (Up to 500 orders/month)',
            qty: 6,
            unitPrice: 3200,
            total: 19200
          }
        ],
        terms: "1. Valid for 15 days.\n2. Net 30 payment terms upon monthly invoice.\n3. Minimum 6 months contract commitment.",
        createdBy: user._id,
        isActive: true
      }
    ];

    for (const t of templates) {
      await ProposalTemplate.findOneAndUpdate(
        { name: t.name },
        t,
        { upsert: true, new: true }
      );
      console.log(`✅ Seeded template: ${t.name}`);
    }

    console.log('🎉 Successfully created 4 proposal templates with header & footer banners!');
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('Error seeding proposal templates:', err);
    process.exit(1);
  }
}

seedProposalTemplates();
