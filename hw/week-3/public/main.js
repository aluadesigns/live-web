let canvas;
let cntx;


window.onload = () => {
  start();
};

const start = () => {

    var socket = io.connect();
			
	socket.on('connect', function() { 
		console.log("Connected");
			});
        
            
        document.getElementById("chat").style.display = "none";

        
        // canvas
        canvas = document.getElementById("draw");
        cntx = canvas.getContext('2d');


        document.getElementById("join").addEventListener("click", () =>{
        const name = document.getElementById("name").value;
        socket.emit('name', name);
        });
        socket.on('move', (data)=>{
            io.emit() //?
            cntx.filRect(data.x, data.y, 40, 60);

        })

        canvas.addEventListener('mousemove', (e)=>{
            console.log(e);
            socket.emit('move', {x:e.x, y:e.y})
        })



        socket.on('name', function(name){
            document.getElementById('users').innerHTML = name + " joined!" + "<br>" + document.getElementById('users').innerHTML;
            document.getElementById("chat").style.display = "block";
            document.getElementById("entry").style.display = "none";
        });

        
        document.getElementById("sendmessage").addEventListener("click", () =>{
            const message = document.getElementById("message").value;
            socket.emit('chatmessage', message);
            
            document.getElementById("message").value = "";

        });

        document.getElementById("message").addEventListener("keydown", (e) =>{
            if (e.key == "Enter" && !e.shiftKey) {
                e.preventDefault;
                document.getElementById("sendmessage").click();
            }
        });



			// Receive from any event
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