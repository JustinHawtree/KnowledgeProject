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


// db.serialize(() => {
//     db.each('SELECT username as user, firstName as name, ID as id FROM Users', (err, row) => {
//     if(err) {
//         console.error(err.message);
//     }
//     console.log(row.user +"\t"+row.name+"\t"+row.id);
//     });
// });


 
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
function validToken(token, callback) {
		let sql = 'SELECT expire expiredDate FROM Users WHERE token = ?';
		console.log("SQL: "+sql);
		db.get(sql,token, (err, row) => {
			if(err){
				console.log(err.message);
				console.log("bad response 3");
				callback(false);
			}
			if(row){
				let response = checkExpired(row.expiredDate);
				if(response)
				{
					console.log("good response");
					callback(true);
				}else
				{
					console.log("bad response");
					callback(false);
				}
			}else{
				console.log("bad response2");
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
	console.log("Date:   "+date+"\nExpired "+expired);
	if( expired > date)
	{
		console.log("Expired token");
		return 0;
	}
	else{
		console.log("Token A OK");
		return 1;
	}
}


// TODO routes
// GET   /profile/{id}
function getProfileRoute (req, res){
    //console.log(req);
	console.log("Value: "+req.params.id);
	let getID = req.params.id;

    // If Unauthorized return 401
    //  res.sendStatus(401);
    
	// If username is found return 200
	let sql = 'SELECT firstName fn, lastName ln FROM Profile WHERE userID = ?';
	db.get(sql, [getID], (err, row) => {
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
}

app.get('/profile/:id', getProfileRoute);




// POST  /login
function postLoginRoute (req, res){
	let username = req.body.username;
	let password = req.body.password;
	let userToken = req.body.token;

	// console.log("Token Status: "+validToken(userToken));

    validToken(userToken, function(isValidToken){

		if(isValidToken){
			console.log("User: "+username+" tried logging in again at "+new Date());
			res.sendStatus(401);
			return;
		}
		else{
			console.log("Token NOT Valid");
		}

		let getSql = 'SELECT userID id, token token, expire expire FROM Users WHERE username = ? AND password = ?';

		db.get(getSql, [username, password], (err, row) => {
			if(err){
				console.log(err.message);
				res.sendStatus(500);
				return;
			}

			if(row){
				// Added Functionality if needed
				// if(!row.token)
				// {
				// 	// Since no token is in the datebase make one
				// }else{
				// 	// Maybe check token validation for the token inside the database
				// }

				// We are just going to update the token reguardless if its in our database.
				let token = crypto.createHash('sha256').update(username+new Date().getTime()).digest('hex');
				let expire = new Date().getTime();
				let updateSql = 'UPDATE Users SET expire = ?, token = ? WHERE userID = '+row.id;
				let data = [expire, token];

				console.log("Token: "+token+"  expire: "+expire);
				
				db.run(updateSql, data, (err) => {
				
					if(err)
					{
						console.error(err.message);
					}
					res.status(200).json({"token":token});
					console.log('updated');
				});
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
	let token = req.body.token;
	let username = req.body.username;
	console.log("Token: "+token);
	console.log("Username: "+username);
	if(!token || !username)
	{
		res.sendStatus(401);
		return;
	}

	let getSql = 'SELECT userID ID FROM Users WHERE username = ? AND token = ?';
	
	db.get(getSql, [username, token], (err, row) => {
		if(err){
			console.error(err.message);
			res.sendStatus(500);
			return;
		}
		if(row){

			// apparently I cant do it by username look up?
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
			res.sendStatus(401);
		}
	});
    
    // The request was Unauthorized
    //res.sendStatus(401);
}

app.post('/logout', postLogoutRoute);




// POST  /profile/{id}/note
function postNoteRoute (req, res){
    console.log("User ID to put Note on: "+req.parmas.id);
    console.log("User Making the note: "+req.headers.user_id);
    console.log("Note: "+req.body.note);    
    // Make sure user is logged in before posting note
    // The Profile was updated
    res.sendStatus(200);

    // the request was Unauthorized
    //res.sendStatus(401);
}
app.post('/profile/:user_id/note', postNoteRoute);


// Put  /profile/{id}
function putProfileRoute (req, res){
    console.log("ID: "+req.params.id);
    //console.log("Avatar URL: "+req.body.avatarURL);
    //console.log("password: "+req.body.password);
    //console.log("old password: "+req.body.oldPassword);
    //console.log("Avatar: "+req.body.avatar);
	let ID = req.params.id;
	let avatarUrl = req.body.avatarUrl;
	let password = req.body.password;
	let oldPassword = req.body.oldPassword;
	let avatar = req.body.avatar;
	let data = [];
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
