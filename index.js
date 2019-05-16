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
function validToken(token, username, userID, callback) {
		if(!token || (!username && !userID)){
			callback(false);
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

		db.get(sql, data, (err, row) => {
			if(err){
				console.log(err.message);
				callback(false);
				return;
			}
			if(row){
				let response = checkExpired(row.expiredDate);
				if(response)
				{
					callback(true);
				}else
				{
					callback(false);
				}
			}else{
				callback(false);
			}
		});
}

function checkExpired(dateNum) {
	if(!dateNum)
	{
		return 0;
	}

	let date = new Date(dateNum*1); 
	date.setDate(date.getDate()+21);
	date = date.getTime();

	let expired = new Date();
	expired = expired.getTime();

	if( expired > date)
	{
		return 0;
	}
	else{
		return 1;
	}
}


// TODO routes
// GET   /profile/{id}
function getProfileRoute (req, res){
    //console.log(req);
	let requestID = req.params.id;
	let username = req.body.username;
	let userID = req.body.id;
	let userToken = req.body.token;

	validToken(userToken, username, userID, function(isValidToken){

		if(!isValidToken){
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
	
		
		let sql = 'SELECT firstName fn, lastName ln FROM Profile WHERE userID = ?';
		db.get(sql, [requestID], (err, row) => {
			if(err){
				res.sendStatus(500);
				return;
			}
		
			if(row){
				res.status(200).json({firstName: row.fn, lastName: row.ln});
			}else{
				res.sendStatus(500);
			}
		});
	});
}

app.get('/profile/:id', getProfileRoute);



// POST  /login
function postLoginRoute (req, res){
	let username = req.body.username;
	let password = req.body.password;
	let userToken = req.body.token;

    validToken(userToken, username, null, function(isValidToken){

		if(isValidToken){
			console.log("User: "+username+" tried logging in again at "+new Date());
			res.sendStatus(401);
			return;
		}

		let getSql = 'SELECT userID id, token token, expire expire FROM Users WHERE username = ? AND password = ?';

		db.get(getSql, [username, password], (err, row) => {
			if(err){
				console.log(err.message);
				res.sendStatus(500);
				return;
			}

			if(row){
				// If they have a valid token in the datebase but did not send it to us
				if(row.token)
				{
					validToken(row.token, username, null, function(isValidToken){
						if(isValidToken)
						{
							console.log("User: "+username+" tried logging in again at "+new Date());
							res.status(401).json({token:row.token});
							return;
						}
					});
				}
				// If we didnt have a valid token in the datebase or if it was invalid generate one for them
				if(!res.headersSent){
					let token = crypto.createHash('sha256').update(username+new Date().getTime()).digest('hex');
					let expire = new Date().getTime();
					let updateSql = 'UPDATE Users SET expire = ?, token = ? WHERE userID = '+row.id;
					let data = [expire, token];
				
					db.run(updateSql, data, (err) => {
				
						if(err){
							console.error(err.message);
						}
						res.status(200).json({"token":token});
						console.log("User: "+username+" logged in with Token: "+token+"  expire: "+expire);
					});
				}
			}else{
				console.log("Wrong Username/Password combination");
				res.sendStatus(401);
			}
		});
	});
}

app.post('/login', postLoginRoute);



// POST  /logout
function postLogoutRoute (req, res){
	let userToken = req.body.token;
	let username = req.body.username;
	if(!userToken || !username)
	{
		res.sendStatus(401);
		return;
	}

	validToken(userToken, username, null, function(isValidToken){

		if(!isValidToken){
			console.log("User: "+username+" tried logging out with invalid token");
			res.sendStatus(401);
			return;
		}
		
		let getSql = 'SELECT userID ID FROM Users WHERE username = ? AND token = ?';
	
		db.get(getSql, [username, userToken], (err, row) => {
			if(err){
				console.error(err.message);
				res.sendStatus(500);
				return;
			}
			if(row){

				let updateSql = 'UPDATE Users SET token = NULL, expire = NULL WHERE userID = '+row.ID;

				db.run(updateSql, (err) => {
					if(err)
				 	{
						console.error(err.message);
						res.sendStatus(500);
						return;
			 		}
			 		console.log('User '+username+" has logged out.");
					res.sendStatus(200);
				});
			}else{
				console.log("User "+username+" tried logging out with valid token but not correct user token: "+userToken);
				res.sendStatus(401);
			}
		});
	});
}

app.post('/logout', postLogoutRoute);




// POST  /profile/{id}/note
function postNoteRoute (req, res){
	let userPoster = req.headers.user_id;
	let userNotes = req.params.id;
	let note = req.body.note;  
	let userToken = req.body.token;

	validToken(userToken, null, userPoster, function(isValidToken){
		
		// Make sure user is logged in before posting note
		if(!isValidToken){
			console.log("User: "+userPoster+" tried creating a note for "+userNotes+" with invalid token");
			res.sendStatus(401);
			return;
		}

		let insertSql = 'INSERT INTO Notes (userID, postID, created, body) VALUES (?, ?, ?, ?)';
		let data = [userNotes, userPoster, new Date(), note];

		db.run(insertSql, data, (err) => {
			if(err)
		 	{
				console.error(err.message);
				res.sendStatus(500);
				return;
		 	}
			console.log('User '+userPoster+' has posted on '+userNotes+' notes');
			res.sendStatus(200);
		});
	});
}
app.post('/profile/:id/note', postNoteRoute);



// Put  /profile/{id}
function putProfileRoute (req, res){
	let ID = req.params.id;
	let userToken = req.body.token;
	let avatarUrl = req.body.avatarUrl;
	let password = req.body.password;
	let oldPassword = req.body.oldPassword;
	let avatar = req.body.avatar;
	let data = [];

	validToken(userToken, null, ID, function(isValidToken){

		if(!isValidToken){
			console.log("User: "+username+" tried updating with wrong token");
			res.sendStatus(401);
			return;
		}

	});

	let getSql = 'SELECT userID id FROM Users WHERE userID = '+ID;
	
	db.get(getSql, (err, row) => {
		if (err)
		{
			res.sendStatus(500);
			return;
		}

		if (row)
		{
			console.log("Valid ID");
			if (oldPassword && password)
			{
				console.log("pass?");
				let getSql = 'SELECT userID id FROM Users WHERE password = ? AND userID = ?';

				db.get(getSql, [oldPassword, ID], (err, row) => {
					if (err)
					{
						return;
					}

					if (row)
					{
						let updatePassSql = 'UPDATE Users SET password = ? WHERE userID = '+ID;
						
						db.run(updatePassSql, password, (err) => {
							if(err)
							{
								console.error(err.message);
								res.sendStatus(500);
								return;
							}
							console.log('Password updated');
						});
					}
				});
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
			updateSQL += " WHERE userID = "+row.id;

			console.log("profile ID: "+row.id);

			db.run(updateSQL, data, (err) => {
				if(err)
				{
					console.error(err.message);
					res.sendStatus(500);
				}
				console.log('updated Avatar Stuff');
				res.sendStatus(200);
			});
		}else{
			res.sendStatus(401);
			return;
		}
	});
}

app.put('/profile/:id', putProfileRoute);



server.listen(PORT);
console.log('### INFO: listening on port %j', PORT);
console.log('### INFO: Environment -', process.env.RUN_ENV || 'Local');
