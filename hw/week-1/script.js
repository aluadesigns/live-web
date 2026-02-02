let clicks = 0;
let x = 0; //to store the previous position of the mouse
let y = 0;
let newX = 0; // how much did the mouse move 
let newY = 0;
let selected;
let appear = true;

window.addEventListener('load', init);

function init() {
    let thebody = document.body;
    thebody.addEventListener('click', clickCalled);

    document.getElementById("clicks").addEventListener('mouseover', changeColor);
    document.getElementById("clicks").addEventListener('mouseleave', changebackColor);
    let puzzles = document.getElementsByClassName("puzzle");

    for (let i=0; i<puzzles.length; i++) {
    puzzles[i].addEventListener('mousedown', down);
    puzzles[i].addEventListener('mouseover', playaudio);
    //puzzles[i].addEventListener('click', stopaudio);

    function playaudio() {
        let audio = document.getElementById(puzzles[i].dataset.audio);
        audio.currentTime = 0;
        audio.play();

        setTimeout(stopaudio, 1000);

        function stopaudio() {
        audio.pause();

    }
    }




    function down(event) {
        x = event.clientX;
        y = event.clientY;
        console.log(x, y);

        selected = event.target; //which rect is selected

        document.addEventListener('mousemove', mouseMove);
        document.addEventListener('mouseup', mouseRelease);

    }
    function mouseMove(event) {
        newX = x - event.clientX;
        newY = y - event.clientY;

        x = event.clientX;
        y = event.clientY;

        selected.style.top = (selected.offsetTop - newY) + "px";
        selected.style.left = (selected.offsetLeft - newX) + "px";
    }

    function mouseRelease() {
         document.removeEventListener('mousemove', mouseMove);
    }
}
    function changeColor() {
        let circleChanged = document.getElementById("clicks");
        circleChanged.style.color = "red";
    }
    function changebackColor() {
        document.getElementById("clicks").style.color = "blue";
    }


    function clickCalled() {
        clicks++;
        console.log(clicks);
        let clicksElement = document.getElementById("clicks");
        clicksElement.innerHTML = clicks;

        clicksElement.style.fontSize = 16+ clicks + "px";
    }


    var video = document.getElementById("video-1");
    console.log(video);

    var pressButton = document.getElementById("press");
    pressButton.addEventListener('click', dissapear);
    video.addEventListener('click', play);
    video.addEventListener('timeupdate', time);
    video.addEventListener('mouseover', fast);
    video.addEventListener('mouseout', slow);

    function fast() {
        video.playbackRate = 10;
    }

    function slow() {
        video.playbackRate = 1;
    }


    function time(event){
        console.log(video.currentTime);
        if (video.currentTime <= 3){
            document.body.style.background = "blue";
        }

        else if (video.currentTime<=6){
            document.body.style.background = "yellow";
        }

        else if (video.currentTime<=9){
            document.body.style.background = "pink";
        }

        else if (video.currentTime<=13){
            document.body.style.background = "purple";
        }
    }

    function dissapear(){
        if (appear){
        video.style.display = "none";
    }
        else{
            video.style.display = "block";
        }
        appear = !appear;
    }

    function play(){

        if (appear){
            video.play();
            video.loop = true;
        }

        else {
            video.pause();

        }
        appear = !appear;

    }



    //hover audio

    // Query selector and forEach but it's not working

    // var puzzle = document.querySelectorAll(".puzzle");
    // puzzle.forEach(puzzle => {
    //     let audio = document.getElementById(puzzle.dataset.audio);
    //     puzzle.addEventListener("mouseover", play);

    //      function play() {
    //           if (yes){
    //             audio.play();
    //     }

    //          else{
    //             audio.pause();
    //     }

    //         yes = !yes;
    //      }

    // })



// var a1 = document.getElementById("a1");
// var a2 = document.getElementById("a2");


// document.getElementById("p1").addEventListener("mouseover", function audio1(){a1.play();});
// document.getElementById("p1").addEventListener("mouseout", function noaudio1(){a1.pause();});
// document.getElementById("p2").addEventListener("mouseover", function audio2(){a2.play();});
// document.getElementById("p2").addEventListener("mouseout", function noaudio2(){a2.pause();});



//would love to figure out how to make it that when i compine two pieces together, a video appears
//also want to learn how to make the pieces snap together


//in progress trying to figure out how moving puzzle by clicking would work
//document.getElementById("p1").addEventListener('click', puzzlemove );
// function puzzlemove() {
//         let puzzleposition = document.getElementById("p1");
//         let top = parseInt(puzzleposition.style.top, 10)

//         if (top>=0 && top <= window.innerHeight){
//         puzzleposition.style.top = clicks*100 + "px";
//         }

//         else{
//         puzzleposition.style.left = clicks*100 + "px";
//         }
//     }



}
