const crypto = require('crypto');

// Helper: Normalize name by converting to lowercase and stripping all whitespace
function normalizeName(str) {
  return str ? str.trim().toLowerCase().replace(/\s+/g, '') : '';
}

// Signature calculator for md5
function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

// Signature calculator for qauthorization header
function getQAuthorization() {
  const t = Date.now();
  const sign = md5(t + 'zczyadmin' + t + 'zczytokenAuth');
  return `${t}@@@${sign}`;
}

module.exports = {
  normalizeName,
  md5,
  getQAuthorization
};
