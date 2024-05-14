const bcrypt = require('bcryptjs');

const plaintext = process.argv[2]

bcrypt.hash(plaintext, 10, (_, hash) => {
	console.log(hash)
})
