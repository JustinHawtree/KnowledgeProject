'use strict';

// undefined, null, "", 0, false    is reguarded as false

const express = require('express');
const app = express();
const server = require('http').createServer(app);
const bodyParser = require('body-parser');

// Hashing
let crypto = require('crypto');

// this can be any port desired.
const PORT = 8080;

// TODO database connection
const sqlite3 = require('sqlite3').verbose();
 
// Open database
let db = new sqlite3.Database('./Users.db', (err) => {
  if (err) {
    return console.error(err.message);
  }
  console.log('Connected to the SQlite database.');
});


// Datebase functions
function getRowDB(sql, params){
	return new Promise((resolve,reject) => {
		db.get(sql, params, (err, row) => {
			if(err){
				console.log(err.message);
				reject(err);
			}

			if(row){
				resolve(row);
			}
			// Need to find something to return that indicates row not found
			reject(null);
		});
	});
};

function getAllDB(sql, params){
	return new Promise((resolve, reject) => {
		db.all(sql, params, (err, rows) => {
			if(err){
				console.log(err.message);
				reject(err);
			}

			if(rows && rows.length > 0){
				resolve(rows);
			}else{
				// Need to find something to return that indicates rows not found 
				reject(null);
			}
		});
	});
};

function runDB(sql, params){
	return new Promise((resolve, reject) => {
		db.run(sql, params, (err) => {
			if(err){
				console.log(err.message);
				reject(err);
			}
			resolve();
		});
	});
};


// close the database connection
// db.close((err) => {
//   if (err) {
//     return console.error(err.message);
//   }
//   console.log('Close the database connection.');
// });



// this is only for the swagger doc.
app.use(express.static('swagger'));

// middle-ware to accept requestBody
app.use(bodyParser.json());



// Authenication
function validateToken(token, username, userID) {
	return new Promise( async (resolve, reject) =>{

		if(!token || (!username && !userID)){
			reject();
			return;
		}
		let sql;
		let data = [token];
		if(username){
			sql = 'SELECT expire expiredDate FROM Users WHERE token = ? AND username = ?';
			data.push(username);
		}
		else{
			sql = 'SELECT expire expiredDate FROM Users WHERE token = ? AND userID = ?';
			data.push(userID);
		}

		let row;
		try{
			row = await getRowDB(sql, data)
		}catch(err){
			reject();
			return;
		}

		let response = checkExpired(row.expiredDate);
		if(response){
			resolve();
		}else{
			reject();
		}
	});
}


function checkExpired(dateNum) {
	if(!dateNum){
		return 0;
	}

	let date = new Date(dateNum*1); 
	date.setDate(date.getDate()+21);
	date = date.getTime();

	let expired = new Date();
	expired = expired.getTime();
	if( expired > date){
		return 0;
	}else{
		return 1;
	}
}



// TODO routes
// GET   /profile/{id}

app.get('/profile/:id', async (req, res) =>{
	
	let requestID = req.params.id;
	let username = req.body.username;
	let userID = req.body.id;
	let userToken = req.body.token;

	try{
		await validateToken(userToken, username, userID);
	}catch(err){
		if(username){
			console.log("User: "+username+" tried to access userID: "+requestID+" profile");
		}
		else if(userID){
			console.log("User: "+userID+" tried to access userID: "+requestID+" profile");
		}
		else if(token){
			console.log("Token: "+token+" tried to access userID: "+requestID+" profile");
		}
		else{
			console.log("Request to access userID: "+requestID+" profile with no credentials given");
		}
		res.sendStatus(401);
		return;
	}
	
		
	let requestProfileSql = 'SELECT firstName firstName, lastName lastName, avatarUrl avatarUrl, username username, profileID profileID FROM Profile INNER JOIN Users ON Users.userID = Profile.userID WHERE Profile.userID = ?';
	let allNoteSql = 'SELECT postID posterID, NoteID noteID, created created, body text FROM Notes WHERE userID = ?'; 

	let jsonObject = {};
	let requestUser;
	let requestNotes;

	try{
		requestUser = await getRowDB(requestProfileSql, requestID);
	}catch(err){
		res.sendStatus(500);
		return;
	}

	jsonObject.username = requestUser.username;
	jsonObject.firstName = requestUser.firstName;
	jsonObject.lastName = requestUser.lastName;
	jsonObject.avatarUrl = requestUser.avatarUrl;
	jsonObject.profileID = requestUser.profileID;
	jsonObject.notes = [];

	try{
		requestNotes = await getAllDB(allNoteSql, requestID);
	}catch(err){
		res.status(200).json(JSON.parse(JSON.stringify(jsonObject)));
		console.log("User: "+userToken+" retrieved user info on userID: "+requestID);
	}

	const processNotes = async (requestNotes) =>{
		const notes = requestNotes.map((requestNote) =>{
			return getRowDB(requestProfileSql, requestNote.posterID)
			.then((posterUser) =>{
				let noteObj = {};
				let postedBy = {};
				let postedTo = {};

				postedBy.userName = posterUser.username;
				postedBy.firstName = posterUser.firstName;
				postedBy.lastName = posterUser.lastName;
				postedBy.avatarUrl = posterUser.avatarUrl;
		
				noteObj.posted_by = postedBy;
		
				postedTo.profile_id = jsonObject.profileID;
				postedTo.username = jsonObject.username;
				postedTo.firstName = jsonObject.firstName;
				postedTo.lastName = jsonObject.lastName;
				postedTo.avatarUrl = jsonObject.avatarUrl;
		
				noteObj.posted_to = postedTo;
		
				noteObj.text = requestNote.text;
				noteObj.created = requestNote.created;

				jsonObject.notes.push(noteObj);
			});
		});
		return Promise.all(notes);
	};
	
	const resultJsonObject = () =>{
		res.status(200).json(JSON.parse(JSON.stringify(jsonObject)));
		console.log("User: "+userToken+" retrieved user info on userID: "+requestID);
	};

	processNotes(requestNotes).then(resultJsonObject).catch((err) =>{
		console.log(err);
		res.sendStatus(500);
	});
});




// POST  /login
app.post('/login', async (req, res) => {
	let username = req.body.username;
	let password = req.body.password;
	let userToken = req.body.token;

	// if they didnt give us a username or password to check then return out imeditately
	if(!username || !password){
		res.sendStatus(401);
		return;
	}

	try{
		await validateToken(userToken, username, null);
		// we actually need to return out if the user already has a valid token
		console.log("User: "+username+" tried logging in again at "+new Date());
		res.sendStatus(401);
		return;
	}catch(err){
		// we actually need to be here for a valid login
	}

	console.log("Made it here in login?");

	let getUserSql = 'SELECT userID id, token token, expire expire FROM Users WHERE username = ? AND password = ?';
	let user;
	try{
		user = await getRowDB(getUserSql, [username, password]);
	}catch(err){
		if(err){
			res.sendStatus(500);
			return;
		}else{
			// Row not found so username/password combination is wrong
			console.log("Wrong Username/Password combination");
			res.sendStatus(401);
			return;
		}
	}

	// If they have a validate token in the datebase but did not send it to us
	try{
		await validateToken(user.token, username, null);
		console.log("User: "+username+" tried logging in again at "+new Date());
		res.status(401).json({token:user.token});
		return;
	}catch(err){}

	// If we didnt have a validate token in the datebase or if it was invalid generate one for them
	let token = crypto.createHash('sha256').update(username+new Date().getTime()).digest('hex');
	let expire = new Date().getTime();
	let updateSql = 'UPDATE Users SET expire = ?, token = ? WHERE userID = '+user.id;
	let data = [expire, token];
	
	try{
		await runDB(updateSql, data);
	}catch(err){
		res.sendStatus(500);
		return;
	}
	res.status(200).json({"token":token});
	console.log("User: "+username+" logged in with Token: "+token+"  expire: "+expire);
});




// POST  /logout
app.post('/logout',  async (req, res) => {
	let userToken = req.body.token;
	let username = req.body.username;
	if(!userToken || !username)
	{
		res.sendStatus(401);
		return;
	}

	try{
		await validateToken(userToken, username, null);
	}catch(err){
		if(err){
			res.sendStatus(500);
			return;
		}
		console.log("User: "+username+" tried logging out with invalid token");
		res.sendStatus(401);
		return;
	}

	let updateSql = 'UPDATE Users SET token = NULL, expire = NULL WHERE username = ?';
	try{
		await runDB(updateSql, username);
	}catch(err){
		res.sendStatus(500);
		return;
	}
	console.log('User '+username+" has logged out.");
	res.sendStatus(200);
});






// POST  /profile/{id}/note
app.post('/profile/:id/note', async (req, res) => {
	let userPoster = req.headers.user_id;
	let userNotes = req.params.id;
	let note = req.body.note;  
	let userToken = req.body.token;

	try{
		await validateToken(userToken, null, userPoster);
	}catch(err){
		if(err){
			res.sendStatus(500);
			return;
		}
		console.log("User: "+userPoster+" tried creating a note for "+userNotes+" with invalid token");
		res.sendStatus(401);
		return;
	}


	let insertSql = 'INSERT INTO Notes (userID, postID, created, body) VALUES (?, ?, ?, ?)';
	let data = [userNotes, userPoster, new Date(), note];

	try{
		await runDB(insertSql, data);
	}catch(err){
		res.sendStatus(500);
		return;
	}
	console.log('User '+userPoster+' has posted on '+userNotes+' notes');
	res.sendStatus(200);
});




// Put  /profile/{id}
app.put('/profile/:id', async (req, res) => {
	let ID = req.params.id;
	let userToken = req.body.token;

	let avatarUrl = req.body.avatarUrl;
	let password = req.body.password;
	let oldPassword = req.body.oldPassword;
	let avatar = req.body.avatar;
	let data = [];

	try{
		await validateToken(userToken, null, ID);
	}catch(err){
		if(err){
			res.sendStatus(500);
			return;
		}
		console.log("UserID: "+ID+" tried updating with wrong token");
		res.sendStatus(401);
		return;
	}

	if(oldPassword && password){
		let getUserSql = 'SELECT userID id FROM Users WHERE userID = ? AND password = ?';
		try{
			await getRowDB(getUserSql, [ID, oldPassword]);
			let updatePassSql = 'UPDATE Users SET password = ? WHERE userID = '+ID;
			await runDB(updatePassSql, password);
			console.log('Password Updated');

		}catch(err){
			console.log(err);
			res.sendStatus(500);
			return;
		}
	}

	let updateSQL = 'UPDATE Profile SET';

	if(!avatar && !avatarUrl)
	{
		res.sendStatus(422);
		return;
	}

	if (avatarUrl)
	{
		updateSQL += " avatarUrl = ?,";
		data.push(avatarUrl);
	}

	if (avatar)
	{
		updateSQL += " avatar = ?,";
		data.push(avatar);
	}

	updateSQL = updateSQL.slice(0, -1);
	updateSQL += " WHERE userID = "+ID;

	try{
		await runDB(updateSQL, data);
	}catch(err){
		res.sendStatus(500);
		return;
	}
	console.log('updated Avatar Stuff');
	res.sendStatus(200);
});



server.listen(PORT);
console.log('### INFO: listening on port %j', PORT);
console.log('### INFO: Environment -', process.env.RUN_ENV || 'Local');
