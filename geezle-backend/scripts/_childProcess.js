// thin wrapper so tests can mock execSync easily
module.exports = {
  execSync: require('child_process').execSync,
};
