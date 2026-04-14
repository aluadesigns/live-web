// HTTPS server 
const https = require('https');
const fs = require('fs'); // Using the filesystem module

const credentials = { 
key: fs.readFileSync('/etc/letsencrypt/live/aa13577.itp.io/privkey.pem'), 
cert: fs.readFileSync('/etc/letsencrypt/live/aa13577.itp.io/cert.pem') //can also do fullchain.pem, it's for all the chain of certificates, useful for older browsers 
};

// Express is a node module for building HTTP servers
const express = require('express');
const app = express();

// Tell Express to look in the "public" folder for any files first
app.use(express.static('public'));

// If the user just goes to the "route" / then run this function
app.get('/', function (req, res) {
  res.send('Hello World!')
});


// We pass in the Express object
const httpsServer = https.createServer(credentials,app);
// Listen on port 8080
httpsServer.listen(443); //443 is default for https

// WebSocket Portion
// WebSockets work with the HTTP server
// var io = require('socket.io')(httpServer);
const { Server } = require("socket.io");
const io = new Server(httpsServer);

// Register a callback function to run when we have an individual connection
// This is run for each individual user that connects
io.sockets.on('connection', 
        // We are given a websocket object in our function
    function (socket) {

        console.log("We have a new client: " + socket.id);

        socket.on('newuser', (name) => {
            console.log(name + " joined");
            socket.name = name;

            socket.emit('startchat', name);
            io.emit('userjoined', name);

        });

        socket.on('cursor', (pos) => {

            const cursordata = {
                x: pos.sendX,
                y: pos.sendY,
                name: socket.name
            }
            socket.broadcast.emit('cursor', cursordata);
        });

        socket.on('draw', (pos) => {
            const drawdata = {
                startX: pos.startX,
                startY: pos.startY,  
                x: pos.x,
                y: pos.y,
                type: pos.type
            }
            io.emit('draw', drawdata);
        })

        //listening for video and emiting it to everyone
        socket.on('video', (v) => {
            const imagedata = {
                img: v.img,
                x: v.sendX,
                y: v.sendY
            }
            io.emit('video', imagedata);
        });



        // When this user emits, client side: socket.emit('otherevent',some data);
        socket.on('chatmessage', (data) => {

            const messageinfo = {
                user: socket.name,
                time: Date.now(),
                text: data.text,
                x: data.sendX,
                y: data.sendY
            }
            
            // Data comes in as whatever was sent, including objects
            console.log("Received: 'chatmessage' " + data.text + " by " + socket.name + " at " + Date.now());
            // Send it to all of the clients
            io.emit('chatmessage', messageinfo); //io emit sends the messages to everyone, including you
        });

        socket.on('disconnect', () => {
                        console.log("Client has disconnected " + socket.id);
                });
        }
);