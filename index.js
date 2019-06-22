'use strict';

const express = require('express');
const app = express();
const server = require('http').createServer(app);
const bodyParser = require('body-parser');

// Hashing
let crypto = require('crypto');

// Port for connection.
const PORT = 8080;

// Database connection
const sqlite3 = require('sqlite3').verbose();

// Open database
let db = new sqlite3.Database('./Users.db', (err) => {
    if (err) {
        return console.error(err.message);
    }
    console.log('### INFO: Connected to the SQlite database.');
});

// Datebase Functions
// SQL get row function
function getRowDB(sql, params) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            // Got a SQL error need to log it and reject our promise
            if (err) {
                console.log(err.message);
                reject(err);
            }
            // If we found the row we are looking for resolve our promise with the row
            if (row) {
                resolve(row);
            }
            // If we didn't find our row then reject our promise
            reject(null);
        });
    });
};

// SQL get all function
function getAllDB(sql, params) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            // Got a SQL error need to log it and reject our promise
            if (err) {
                console.log(err.message);
                reject(err);
            }
            // We didn't get a SQL error and we found rows that are valid in our sql then resolve our promise
            if (rows && rows.length > 0) {
                resolve(rows);
                // If we didn't get any valid rows in our SQL search then reject the promise
            } else {
                reject(null);
            }
        });
    });
};

// SQL run function
function runDB(sql, params) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, (err) => {
            // Got a SQL error need to log it and reject our promise
            if (err) {
                console.log(err.message);
                reject(err);
            }
            // With SQL run we have no guarantee that a row got updated, so resolve regardless 
            resolve();
        });
    });
};

// Might need in the future if database closing is needed
// close the database connection
// db.close((err) => {
//   if (err) {
//     return console.error(err.message);
//   }
//   console.log('Close the database connection.');
// });


// middle-ware to accept requestBody
app.use(bodyParser.json());


// Authentication validation with token and (username or userID)
// Can call this function with either username or userID but always need a token
function validateToken(token, username, userID) {
    return new Promise(async (resolve, reject) => {

        if (!token || (!username && !userID)) {
            reject();
            return;
        }

        let sql;
		let data = [token];
		
        // Send SQL command with the information they gave us either username or userID
        if (username) {
            sql = 'SELECT expire expiredDate FROM Users WHERE token = ? AND username = ?';
            data.push(username);
        } else {
            sql = 'SELECT expire expiredDate FROM Users WHERE token = ? AND userID = ?';
            data.push(userID);
        }

        let row;
        // Check database for a matching row
        // If row not found in database reject the promise
        try {
            row = await getRowDB(sql, data)
        } catch (err) {
            reject();
            return;
        }

        // If token is in our database check if the token expired
        let response = checkExpired(row.expiredDate);
        if (response) {
            resolve();
        } else {
            reject();
        }
    });
}


function checkExpired(dateNum) {
    if (!dateNum) {
        return 0;
	}
	
    // Make sure expiredDate is casted into an integer and is not a float.
    let expiredDate = new Date(dateNum * 1);

    // Add 3 weeks (21 days) to the expired date from the database
    expiredDate.setDate(expiredDate.getDate() + 21);
    expiredDate = expiredDate.getTime();

    // Get today's date and time
    let today = new Date();
    today = today.getTime();

    // If today's date is bigger then our expired date + 3 weeks then our token is expired
    if (today > expiredDate) {
        return 0;
    } else {
        return 1;
    }
}



// TODO routes
// GET   /profile/{id}
app.get('/profile/:id', async (req, res) => {

    let requestID = req.params.id;
    let username = req.body.username;
    let userID = req.body.id;
    let userToken = req.body.token;

    try {
        await validateToken(userToken, username, userID);
    } catch (err) {
        // Send a log to console indicating what information was wrong with validating the token
        if (username) {
            console.log("### INFO: User: " + username + " tried to access userID: " + requestID + " profile");
        } else if (userID) {
            console.log("### INFO: User: " + userID + " tried to access userID: " + requestID + " profile");
        } else if (token) {
            console.log("### INFO: Token: " + token + " tried to access userID: " + requestID + " profile");
        } else {
            console.log("### INFO: Request to access userID: " + requestID + " profile with no credentials given");
        }
        res.sendStatus(401);
        return;
    }


    let requestProfileSql = 'SELECT firstName firstName, lastName lastName, avatarUrl avatarUrl, username username, profileID profileID FROM Profile INNER JOIN Users ON Users.userID = Profile.userID WHERE Profile.userID = ?';
    let allNoteSql = 'SELECT postID posterID, NoteID noteID, created created, body text FROM Notes WHERE userID = ?';

    let jsonObject = {};
    let requestUser;
    let requestNotes;

    try {
        requestUser = await getRowDB(requestProfileSql, requestID);
    } catch (err) {
        res.sendStatus(500);
        return;
    }

    // Setup the jsonObject we are sending back to the client
    jsonObject.username = requestUser.username;
    jsonObject.firstName = requestUser.firstName;
    jsonObject.lastName = requestUser.lastName;
    jsonObject.avatarUrl = requestUser.avatarUrl;
    jsonObject.profileID = requestUser.profileID;
    jsonObject.notes = [];

    // Check to see if the requested User has any Notes
    // If they do continue on to process them
    // If they dont then return immediately back.
    try {
        requestNotes = await getAllDB(allNoteSql, requestID);
    } catch (err) {
        res.status(200).json(JSON.parse(JSON.stringify(jsonObject)));
        console.log("### INFO: User: " + userToken + " retrieved user info on userID: " + requestID);
    }

    // For all the notes the User has, we need to keep adding it to our jsonObject
    const processNotes = async (requestNotes) => {
        // All the notes we found we need to get information on the User who posted the notes.
        const notes = requestNotes.map((requestNote) => {
            return getRowDB(requestProfileSql, requestNote.posterID)
                .then((posterUser) => {
                    let noteObj = {};
                    let postedBy = {};
                    let postedTo = {};

                    // Load the information into the NoteObject
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

                    // Finally push the NoteObject into the array of our jsonObject
                    jsonObject.notes.push(noteObj);
                });
        });
        // Process all the Promises in order and wait for all of them to finish before continuing
        return Promise.all(notes);
    };

    const returnJsonObject = () => {
        res.status(200).json(JSON.parse(JSON.stringify(jsonObject)));
        console.log("### INFO: User: " + userToken + " retrieved user info on userID: " + requestID);
    };

    // Process all the notes on the user, wait for all the promises to finish then
    //   call the returnJsonObject function to return it to the client
    processNotes(requestNotes).then(returnJsonObject).catch((err) => {
        console.log(err);
        res.sendStatus(500);
    });
});




// POST  /login
app.post('/login', async (req, res) => {
    let username = req.body.username;
    let password = req.body.password;
    let userToken = req.body.token;

    // If they didn't give us a username or password to check then return out immediately
    if (!username || !password) {
        res.sendStatus(401);
        return;
    }

    try {
        await validateToken(userToken, username, null);
        // Need to return out if the user already has a valid token
        // This prevents a valid user from generating multiple tokens
        console.log("### INFO: User: " + username + " tried logging in again at " + new Date());
        res.sendStatus(401);
        return;
    } catch (err) {
        // Need to be here for a valid login
        // If they didn't have a valid token then we need to issue them one if their credentials are valid
	}
	
    // Since they dont have a token we need to validate their credentials
    let getUserSql = 'SELECT userID id, token token, expire expire FROM Users WHERE username = ? AND password = ?';
    let user;
    try {
        user = await getRowDB(getUserSql, [username, password]);
    } catch (err) {
        if (err) {
            res.sendStatus(500);
            return;
        } else {
            // Row not found so username/password combination is wrong
            console.log("### INFO: Wrong Username/Password combination on User: " + username + " Token: " + userToken);
            res.sendStatus(401);
            return;
        }
	}
	
    // Since they have valid credentials we next need to see if they had a valid token in the database
    // If they have a validate token in the database but did not send it to us
    // This will prevent them from farming tokens with login requests
    try {
        await validateToken(user.token, username, null);
        console.log("### INFO: User: " + username + " tried logging in again at " + new Date());
        res.status(401).json({
            token: user.token
        });
        return;
    } catch (err) {}

    // If we didn't have a validate token in the database or if it was invalid generate one for them
    let token = crypto.createHash('sha256').update(username + new Date().getTime()).digest('hex');
    let expire = new Date().getTime();
    let updateSql = 'UPDATE Users SET expire = ?, token = ? WHERE userID = ' + user.id;
    let data = [expire, token];

    // Since we made a token for the user, we should push this new token and expiration into the database
    try {
        await runDB(updateSql, data);
    } catch (err) {
        res.sendStatus(500);
        return;
    }

    // Send the user back the generated token, this could be changed to cookie if the front end wants that
    res.status(200).json({
        "token": token
    });
    console.log("### INFO: User: " + username + " logged in with Token: " + token + "  expire: " + expire);
});




// POST  /logout
app.post('/logout', async (req, res) => {
    let userToken = req.body.token;
    let username = req.body.username;
    // Return out early if the client does not give us the required information
    if (!userToken || !username) {
        res.sendStatus(401);
        return;
    }

    // Check to see if credentials are valid
    try {
        await validateToken(userToken, username, null);
    } catch (err) {
        if (err) {
            res.sendStatus(500);
            return;
        }
        console.log("### INFO: User: " + username + " tried logging out with invalid token");
        res.sendStatus(401);
        return;
    }

    // Since the credentials are valid, reset their token and expiration in the database
    let updateSql = 'UPDATE Users SET token = NULL, expire = NULL WHERE username = ?';
    try {
        await runDB(updateSql, username);
    } catch (err) {
        res.sendStatus(500);
        return;
    }

    // If database got updated successfully them send back confirmation to server logs 
    console.log('### INFO: User ' + username + " has logged out.");
    res.sendStatus(200);
});




// POST  /profile/{id}/note
app.post('/profile/:id/note', async (req, res) => {
    let userPoster = req.headers.user_id;
    let userNotes = req.params.id;
    let note = req.body.note;
	let userToken = req.body.token;
	
    // valid the client's credentials
    try {
        await validateToken(userToken, null, userPoster);
    } catch (err) {
        if (err) {
            res.sendStatus(500);
            return;
        }
        console.log("### INFO: User: " + userPoster + " tried creating a note for " + userNotes + " with invalid token or userID");
        res.sendStatus(401);
        return;
	}
	
    // Since credentials are valid add the note to the database
    let insertSql = 'INSERT INTO Notes (userID, postID, created, body) VALUES (?, ?, ?, ?)';
    let data = [userNotes, userPoster, new Date(), note];

    try {
        await runDB(insertSql, data);
    } catch (err) {
        res.sendStatus(500);
        return;
	}
	
    // If note successfully updated in the server send confirmation to server log
    console.log('### INFO: User ' + userPoster + ' has posted on ' + userNotes + ' notes');
    res.sendStatus(200);
});




// Put  /profile/{id}
// This function updates profile information if given information to update with
// This function will only try to update information if the client sends us all the information needed to do so.
app.put('/profile/:id', async (req, res) => {
    let ID = req.params.id;
    let userToken = req.body.token;

    let avatarUrl = req.body.avatarUrl;
    let password = req.body.password;
    let oldPassword = req.body.oldPassword;
    let avatar = req.body.avatar;
    let data = [];
    let passwordUpdated = false;

    // Validate user's credentials
    try {
        await validateToken(userToken, null, ID);
    } catch (err) {
        if (err) {
            res.sendStatus(500);
            return;
        }
        console.log("### INFO: UserID: " + ID + " tried updating profile with wrong token");
        res.sendStatus(401);
        return;
    }

    // Only update the user's password if the client supplied us with the old password and new password
    if (oldPassword && password) {
        let getUserSql = 'SELECT userID id FROM Users WHERE userID = ? AND password = ?';
        try {
            // First make sure the user and password are valid in our database
            // If not the promise will reject and not continue with updating the user's password
            await getRowDB(getUserSql, [ID, oldPassword]);

            // Since it passed with promise resolve proceed to update the user's password
            let updatePassSql = 'UPDATE Users SET password = ? WHERE userID = ' + ID;
            await runDB(updatePassSql, password);
            console.log('### INFO: Password Updated for UserID: ' + ID);
            passwordUpdated = true;

        } catch (err) {
            // Catch a promise reject and send a log to the server console
            console.log("### INFO: UserID: " + ID + " tried updating password with wrong username/password combination");
        }
    }

    let updateSQL = 'UPDATE Profile SET';

    // check to see if the client wants to update the avatar or avatarURL
    if (!avatar && !avatarUrl) {
        // if the client didn't want to update the avatar or avatarURL check to see if password was updated
        // Since password was updated return back good status code
        if (passwordUpdated) {
            res.sendStatus(200);
            return;
        }
        // If password didn't get updated and client didn't want to update avatar or avatarURL then return back unprocessable status code
        res.sendStatus(422);
        return;
    }

    // Client wants to update avatarURL so add it to the updateSql
    if (avatarUrl) {
        updateSQL += " avatarUrl = ?,";
        data.push(avatarUrl);
	}
	
    // Client wants to update avatar so add it to the updateSql
    if (avatar) {
        updateSQL += " avatar = ?,";
        data.push(avatar);
	}
	
    // Either situations that occur we always need to remove the comma from the end
    // If just avatarURl or avatar or both, we always will need to remove the comma
    // This way catches all cases so we dont have to have many if statements
    updateSQL = updateSQL.slice(0, -1);
    updateSQL += " WHERE userID = " + ID;

    // Update the database with the client information they want updated
    try {
        await runDB(updateSQL, data);
    } catch (err) {
        res.sendStatus(500);
        return;
	}
	
    // Send a log to the server console
    console.log('### INFO: Avatar Updated on User ID: ' + ID);
    res.sendStatus(200);
});



server.listen(PORT);
console.log('### INFO: listening on port %j', PORT);
console.log('### INFO: Environment -', process.env.RUN_ENV || 'Local');