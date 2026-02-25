// Express is a node module for building HTTP servers
var express = require('express');
var app = express();

// Tell Express to look in the "public" folder for any files first
app.use(express.static('public'));

// If the user just goes to the "route" / then run this function
app.get('/', function (req, res) {
  res.send('Hello World!')
});

// Here is the actual HTTP server 
var http = require('http');
// We pass in the Express object
var httpServer = http.createServer(app);
// Listen on port 80
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

                socket.on('name', function(name){
                    console.log(name + " joined");
                    io.emit('name', name)
                    socket.name = name;
                })

                // When this user emits, client side: socket.emit('otherevent',some data);
                socket.on('chatmessage', function(message) {

                  const messageinfo = {
                        user: socket.name,
                        text: message,
                        time: Date.now()
                    }
                        // Data comes in as whatever was sent, including objects
                        console.log("Received: 'chatmessage' " + message + " by " + socket.name + " at " + Date.now());

                        // Send it to all of the clients
                        //socket.broadcast.emit('chatmessage', messageinfo);
                        io.emit('chatmessage', messageinfo); //io emit sends the messages to everyone, including you
                });

                socket.on('disconnect', function() {
                        console.log("Client has disconnected " + socket.id);
                });
        }
);