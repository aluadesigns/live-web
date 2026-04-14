//drawing canvas
let canvas;
let cntx;
let drawcheck = false; //checking when the mouse is up and down
let dmode = false; //checking if the "/" key was pressed to switch draw mode state
let emode = false; //erase mode

//starting point for each user drawing
let startX;
let startY;

//video canvas
let imgcanvas;
let imgcntx;
let vmode = true; //video toggle state heck


//cursor
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

    });

    //chatbox follows my mouse in the messagearea
    document.getElementById("messagearea").addEventListener("mousemove", (e) => {
        x = e.clientX;
        y = e.clientY;
        //console.log(x, y);
        document.getElementById("chatbox").style.display = "block";
        document.getElementById("chatbox").style.position = "fixed";
        document.getElementById("chatbox").style.transform = `translate(${x}px, ${y}px)`;

        socket.emit('cursor', {
            sendX: x,
            sendY: y
        });

    });

    //displaying the username as the cursor
    socket.on('cursor', (cursordata) => {
        const cursor = document.getElementById('cursor');
        cursor.innerHTML = cursordata.name;
        cursor.style.display = "block";
        cursor.style.position = "absolute";
        cursor.style.left = cursordata.x + "px";
        cursor.style.top = cursordata.y + "px";

        //console.log(cursordata.name, "x: " + cursordata.x, "y: " + cursordata.y );
    });

    
    
    //ADDING VIDEO!!
    let video = document.getElementById('thevideo');
    let constraints = { audio: false, video: true }

    if (vmode) {

            // user permission, get the stream
            navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {

                video.srcObject = stream;
                video.onloadedmetadata = function(e) {
                    video.play();
                };

                video.style.display = "block";

            })

            .catch(function(err) {
                alert(err);  
            });
        } 

    //VIDEO TOGGLE!!

    document.getElementById("vtoggle").addEventListener("click", () => {
        vmode = !vmode;
        const video = document.getElementById("thevideo");
        const toggle = document.getElementById("vtoggle");

        toggle.classList.toggle("on");

        if (vmode) {

            // user permission, get the stream
            navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {

                video.srcObject = stream;
                video.onloadedmetadata = function(e) {
                    video.play();
                };

                video.style.display = "block";

            })

            .catch(function(err) {
                alert(err);  
            });
        } 

        else {
            //turn off the camera:
            //the video is made of tracks and video.srcObject.getTracks() gets all the audio and video tracks as an array, 
            //and then forEach goes through that array and stops all of them.
            //right now I only have one video object but I'm gonna keep it as forEach just in case I decide to add more(like screen sharing) in the future :)
            video.srcObject.getTracks().forEach(track => track.stop());

            //no video
            video.srcObject = null;
            video.style.display = "none";
        }
    });
    

    //DRAW mode

    canvas = document.getElementById("draw");
    cntx = canvas.getContext("2d"); //gives the 2d drawing api

    document.addEventListener("keydown", (e) => {
        //console.log("key pressed:", e.key);
    });

    //erasing and clearing
    const erase = document.getElementById("erase");
    // const clear = document.getElementById("clear");

    //erasing cursor
    const erasecur = document.getElementById("erasecur");
    //drawing cursor
    const dcursor = document.getElementById("dcursor");


    window.addEventListener("keydown", (e) => {
        if (e.key == "/") {
            dmode = !dmode;
            document.getElementById("message").value = "";
        }

        if(dmode){
            document.getElementById("chatbox").style.pointerEvents = "none";
            document.getElementById("chatbox").style.opacity = "0";
            dcursor.style.display= "block";
            document.body.style.cursor = "none";
            erase.style.display = "block";
            // clear.style.display = "block";
        }

        else {
            document.getElementById("chatbox").style.pointerEvents = "auto";
            document.getElementById("chatbox").style.opacity = "1";
            document.body.style.cursor = "default";
            dcursor.style.display= "none";
        }
    })

    //need to add a way to store who added what, prob through socket.id
    erase.addEventListener("mousedown", (e) => {
        emode = !emode;

        if (emode) {
            dcursor.style.display = "none";
            erasecur.style.display = "block";
            erase.textContent = "draw";
            erase.style.backgroundColor = "aquamarine";
        } 
        else {
            dcursor.style.display = "block";
            erasecur.style.display = "none";
            erase.textContent = "erase";
            erase.style.backgroundColor = "rgb(174, 127, 255)";
        }
    })

    // I will add the clearing of all later
    // clear.addEventListener("mousedown", () => {
    // })

    
    
    
    
    //drawing the canvas
    
    function drawcanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        //if the window is resized 
        window.addEventListener("resize", () => {
            //creating an old canvas that will store the previous canvas drawing
            const oldCanvas = document.createElement("canvas");
            oldCanvas.width = canvas.width;
            oldCanvas.height = canvas.height;
            oldCanvas.getContext("2d").drawImage(canvas, 0, 0);

            //resizing the actual canvas
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;

            //drawing the old canvas onto the new resized canvas
            cntx.drawImage(oldCanvas, 0, 0);
        });

        canvas.addEventListener("mousedown", (e) => {
            drawcheck = true;
            cntx.beginPath();

            //initial startX and startY
            startX = e.clientX;
            startY = e.clientY;
            cntx.moveTo(startX, startY); //moveTo moves the pen (doesn't draw the line)

        });

        document.addEventListener("mouseup", () => {
            drawcheck = false;
            cntx.beginPath();
        });

        //drawing
        document.addEventListener("mousemove", (e) => {

            if(dmode) {

                if(emode){
                    erasecur.style.left = (e.clientX-10) + "px";
                    erasecur.style.top = (e.clientY-10) + "px";
                }
                
                else{
                    dcursor.style.display = "block";
                    dcursor.style.left = e.clientX + "px";
                    dcursor.style.top = (e.clientY - 20) + "px";
                }

                if (drawcheck){

                    if(!emode){
                        socket.emit("draw", {
                            startX: startX,
                            startY: startY,
                            x: e.clientX,
                            y: e.clientY,
                            type: "draw"
                        })
                    }
                
                    //erasing
                    if(emode){
                        socket.emit("draw", {
                            startX: startX,
                            startY: startY,
                            x: e.clientX,
                            y: e.clientY,
                            type: "erase"
                        })
                    }


                    //update startX and startY
                    startX = e.clientX;
                    startY = e.clientY;
                }
            }

        });
    }

    socket.on('draw', (drawdata) => {
        if(drawdata.type == "draw"){
            cntx.beginPath();
            cntx.lineWidth = 3;
            cntx.moveTo(drawdata.startX, drawdata.startY); 
            cntx.lineTo(drawdata.x, drawdata.y); //draws the line
            cntx.stroke();
        }

        else if (drawdata.type == "erase"){
            cntx.clearRect(drawdata.x - 10, drawdata.y- 10, 20, 20);

        }
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

            //video screenshots

            if(vmode){

                //adding a new canvas for the video capture
                imgcanvas = document.createElement("canvas");
                imgcanvas.width = 700;
                imgcanvas.height = 500;
                imgcntx = imgcanvas.getContext("2d");

                imgcntx.drawImage(video, 0, 0, imgcanvas.width, imgcanvas.height);
                const b64image = imgcanvas.toDataURL();
                
                socket.emit('video', {
                    img: b64image,
                    sendX: x,
                    sendY: y
                });
            }
        }
    });


    socket.on('video', (imagedata) => {
        const cursorimg = document.createElement("IMG");
        cursorimg.src = imagedata.img;
        
        cursorimg.style.position = "absolute";
        cursorimg.style.left = imagedata.x + "px";
        cursorimg.style.top = (imagedata.y - 50) + "px";
        cursorimg.style.width = "70px";
        cursorimg.style.height = "auto";
        cursorimg.style.transform =  "rotateY(180deg)";

        document.body.appendChild(cursorimg);
    })


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