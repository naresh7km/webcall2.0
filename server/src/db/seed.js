const pool = require('../config/database');
const { hashPassword } = require('../services/authService');

async function seed() {
  const email = process.argv[2] || 'admin@webcall.com';
  const password = process.argv[3] || 'admin123';
  const displayName = process.argv[4] || 'Admin';

  const passwordHash = await hashPassword(password);

  const result = await pool.query(
    `INSERT INTO agents (email, password_hash, display_name, role, priority)
     VALUES ($1, $2, $3, 'admin', 1)
     ON CONFLICT (email) DO UPDATE SET password_hash = $2, display_name = $3
     RETURNING id, email, display_name, role`,
    [email, passwordHash, displayName]
  );

  console.log('Seeded admin user:', result.rows[0]);
  console.log(`  Email: ${email}`);
  console.log(`  Password: ${password}`);
  await pool.end();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
