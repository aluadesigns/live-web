let canvas;
let cntx;
let drawcheck = false;
let x = 0;
let y = 0;


window.onload = () => {
    start();

};

const start = () => {

    var socket = io.connect();

	socket.on('connect', () => { 
		console.log("Connected");
	});
    
    //don't display the chat before joining
    document.getElementById("chat").style.display = "none";
    document.getElementById("chatbox").style.display = "none";


    //when the user joins, send the name that they entered

    document.getElementById("join").addEventListener("click", () => {
        const name = document.getElementById("name").value;
        socket.emit('newuser', name);
    });

    //displaying who joined 
    socket.on('userjoined', (newuser) => {
        document.getElementById("users").innerHTML = newuser + " joined!" + "<br>" + document.getElementById('users').innerHTML;

    });

    // switching from entry to chat
    socket.on('startchat', () =>{
        document.getElementById("chat").style.display = "flex";
        document.getElementById("entry").style.display = "none";
        
        drawcanvas();

        //autofocus doesn't work
        // document.getElementById("chatbox").style.focus();
        // document.getElementById("message").style.focus();

    });

    //chatbox follows my mouse in the messagearea
    document.getElementById("messagearea").addEventListener("mousemove", (e) => {
        x = e.clientX;
        y = e.clientY;
        console.log(x, y);
        document.getElementById("chatbox").style.display = "block";
        document.getElementById("chatbox").style.position = "fixed";
        document.getElementById("chatbox").style.transform = `translate(${x}px, ${y}px)`;

        socket.emit('cursor', {
            sendX: x,
            sendY: y
        });
    });

    socket.on('cursor', (cursordata) => {
        const cursor = document.getElementById('cursor');
        cursor.innerHTML = cursordata.name;
        cursor.style.display = "block";
        cursor.style.position = "absolute";
        cursor.style.left = cursordata.x + "px";
        cursor.style.top = cursordata.y + "px";

        console.log(cursordata.name, "x: " + cursordata.x, "y: " + cursordata.y );
    });
    
    function drawcanvas() {
        canvas = document.getElementById("draw");
        cntx = canvas.getContext("2d"); //gives the 2d drawing api

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        canvas.addEventListener("mousedown", () => {
            drawcheck = true;
        });

        canvas.addEventListener("mouseup", () => {
            drawcheck = false;
            cntx.beginPath();
        });


        canvas.addEventListener("mousemove", (e) => {

            if (drawcheck == true){
                const drawX = e.clientX;
                const drawY = e.clientY;

                socket.emit("draw", {
                    x: drawX,
                    y: drawY
                })
            }

        });

    }

      socket.on('draw', (drawdata) => {
                cntx.lineWidth = 3;
                cntx.lineTo(drawdata.x, drawdata.y);
                cntx.stroke();
            })


    //sending the message to the server on enter only
    document.addEventListener("keydown", (e) =>{
        if (e.key == "Enter" && !e.shiftKey) {
                e.preventDefault();
            const message = document.getElementById("message").value;
            socket.emit('chatmessage', {
                text: message,
                sendX: x,
                sendY: y
            });
            
            document.getElementById("message").placeholder = "keep typing!";
            document.getElementById("message").value = "";

        }
    });



	// displaying the messages
	socket.on('chatmessage', (messageinfo) => {
		console.log(messageinfo);
        const name = socket.name;
        const time = new Date(messageinfo.time).toLocaleTimeString(); //time display

        const messagearea = document.getElementById("messagearea");
        //creating new messageboxes every time there's a new input
        const newmessagebox = document.createElement("div");
        const newmessage = document.createElement("div");
        const newtime = document.createElement("div");

        newmessage.innerHTML = messageinfo.text;
        newtime.innerHTML = "by " + messageinfo.user + ", " + time;


        newmessagebox.append(newmessage, newtime);
        messagearea.appendChild(newmessagebox);



        newmessagebox.style.position = "absolute";
        newmessagebox.style.display = "block";

        //document.getElementById('newmessage').style.transform = `translate(${messageinfo.x}px, ${messageinfo.y}px)`;
        newmessagebox.style.left = messageinfo.x + "px";
        newmessagebox.style.top = messageinfo.y + "px";
        newtime.style.fontSize = 12 + "px";
        newtime.style.color = "grey";
    });
        


        //document.getElementById("messagebox").style.transform = `translate(${random}px)`;

 };