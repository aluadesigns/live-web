// Express is a node module for building HTTP servers
const express = require('express');
const app = express();

// Tell Express to look in the "public" folder for any files first
app.use(express.static('public'));

// If the user just goes to the "route" / then run this function
app.get('/', function (req, res) {
  res.send('Hello World!')
});

// Here is the actual HTTP server 
const http = require('http');
// We pass in the Express object
const httpServer = http.createServer(app);
// Listen on port 8080
httpServer.listen(8080);

// WebSocket Portion
// WebSockets work with the HTTP server
// var io = require('socket.io')(httpServer);
const { Server } = require("socket.io");
const io = new Server(httpServer);

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
                x: pos.x,
                y: pos.y
            }
            io.emit('draw', drawdata);
        })




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