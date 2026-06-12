export async function up(pool) {
  if (pool.dialect === 'sqlite') {
    pool.exec(`
      ALTER TABLE application_packages ADD COLUMN cv_pdf_path TEXT;
      ALTER TABLE application_packages ADD COLUMN cover_letter_pdf_path TEXT;
    `);
  } else {
    await pool.query(`
      ALTER TABLE application_packages ADD COLUMN cv_pdf_path TEXT;
      ALTER TABLE application_packages ADD COLUMN cover_letter_pdf_path TEXT;
    `);
  }
}

export async function down(pool) {
  // Not strictly required for this project's simplified migration flow
}
