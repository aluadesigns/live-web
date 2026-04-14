let canvas;
let cntx;


window.onload = () => {
  start();
  let myp5 = new p5(myCanvas, 'canvas');
};

const start = () => {

    var socket = io.connect();

	socket.on('connect', () => { 
		console.log("Connected");
	});
    
    //don't display the chat before joining
    document.getElementById("chat").style.display = "none";

    
    //when the users clicks on join, emit the name that they entered 
    document.getElementById("join").addEventListener("click", () =>{
        const name = document.getElementById("name").value;
        socket.emit('name', name);
    });

    //displaying who joined and switching from entry to chat
    socket.on('name', function(name){
        document.getElementById('users').innerHTML = name + " joined!" + "<br>" + document.getElementById('users').innerHTML;
        document.getElementById("chat").style.display = "block";
        document.getElementById("entry").style.display = "none";
    });

    //sending the message to the server
    document.getElementById("sendmessage").addEventListener("click", () =>{
        const message = document.getElementById("message").value;
        socket.emit('chatmessage', message);
            
        document.getElementById("message").value = ""; //clear the textbox
        document.getElementById("message").placeholder = "keep typing!"; 
    });

    //send messages on enter
    document.getElementById("message").addEventListener("keydown", (e) =>{
            if (e.key == "Enter" && !e.shiftKey) {
                e.preventDefault;
                document.getElementById("sendmessage").click();
            }
    });

	// displaying the messages
	socket.on('chatmessage', function (messageinfo) {
				console.log(message);
                const name = socket.name;
                const time = new Date(messageinfo.time).toLocaleTimeString(); //time display
                document.getElementById('time').innerHTML = time + "<br>" + document.getElementById('time').innerHTML;
				document.getElementById('messages').innerHTML = messageinfo.user + ": " + messageinfo.text + "<br>" + document.getElementById('messages').innerHTML;

            //     const random = (Math.random()*1000-20);
            //     document.getElementById("messagebox").style.transform = `translate(${random}px)`;
	});

 };