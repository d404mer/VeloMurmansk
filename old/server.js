const { ConnectionTCP } = require('node-vmix')
const axios = require('axios');
const fs = require('fs');
const express=require('express') ; 
const bodyParser = require("body-parser");

const app = express();
const PORT ="3000";

const connection = new ConnectionTCP('localhost')


const apiUrl = 'https://myfinish.info/php/gate_online.php?evid=5729&d=11&U=1705686683';

function getathletsjson ( url) {
    axios.get(url)
    .then(response => {
        console.log(response.data);
        const data = response.data ;
        //console.log( data.count )

        const athletes = data.r.map((athlete) => {
          return {
            number: athlete.n,
            name: athlete.i ,
            region: athlete.k,
            score: athlete.s,
            status: athlete.status,
            result: athlete.r,
            details: {
              status: athlete.d.status,
              year: athlete.d.year,
              laps: athlete.d.laps || [],
            },
            user: athlete.u,
            year: athlete.y,
          };
        });
        
        // Log the list of athletes

        athletes.sort((a, b) => {
            // Сравниваем результаты (поле result)
            return a.result - b.result;
        });

        var lidertime = athletes[0].result;
        try { 
          for (let j=1; j<= athletes.length ; j++) {
              let del = athletes[j].result-lidertime
              let t = timeformat(del);
              if (false!== t) athletes[j].result = '+'+timeformat(del)
          }
        } catch(err) {}; 
        athletes[0].result =timeformat(athletes[0].result)
        sortedathletes = athletes;
        
        //console.log(athletes);
        console.log( athletes.length )
        console.log( 'atlets '+ athletes[55].name )


        // for (let i=1; i<=10; i++) {
        // 	connection.send( { Function: 'SetText' , Input: "result" , SelectedName: 'place '+[i]+'.Text', Value: '' } );
        // 	connection.send( { Function: 'SetText' , Input: "result" , SelectedName: 'num '+[i]+'.Text', Value: '' } );
        // 	connection.send( { Function: 'SetText' , Input: "result" , SelectedName: 'name '+[i]+'.Text', Value: '' } );
        // 	connection.send( { Function: 'SetText' , Input: "result" , SelectedName: 'city '+[i]+'.Text', Value: '' } );
        // 	connection.send( { Function: 'SetText' , Input: "result" , SelectedName: 'result '+[i]+'.Text', Value: '' } );
        // }
    })
    .catch(error => {
        console.error
    })
}

function timeformat( time ) {
  if (time>=1000000) return false
	let seconds = time.toString().slice(0, -2);
	let ms = time%100; 
	let sec = seconds%60;
	let min = Math.floor(seconds / 60);
	return min.toString().padStart(2,'0')+":"+sec.toString().padStart(2, '0')+":"+ms.toString().padStart(2, '0'); 
}


app.use(express.static('public'));
app.use(express.urlencoded({extended: true}));
app.use(express.json());

var sortedathletes ; 

app.listen ( PORT, () => {
  console.log( 'server is workking on ' + PORT )
})

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
})

app.post( '/sheet1', (req,res) => {
  console.log( ' sheet 1 zapros ')
  res.send( sortedathletes )          
})

app.post( '/row1', ( req, res)=> {
  console.log( 'row 1 commands')
  let startIndex = req.body.index ;
  console.log(req.body.index+1)
  res.status(200).send( startIndex.toString() )
  console.log( req.body ) 

  for (let i=1; i<=10; i++) {
    connection.send( { Function: 'SetText' , Input: "result" , SelectedName: 'place '+[i]+'.Text',  Value: startIndex*10+i } );
    connection.send( { Function: 'SetText' , Input: "result" , SelectedName: 'num '+[i]+'.Text', Value: (req.body.item[i-1]) ? (req.body.item[i-1].number) : "" } );
    connection.send( { Function: 'SetText' , Input: "result" , SelectedName: 'name '+[i]+'.Text', Value: (req.body.item[i-1]) ? (req.body.item[i-1].name) : "" } );
    connection.send( { Function: 'SetText' , Input: "result" , SelectedName: 'city '+[i]+'.Text', Value: (req.body.item[i-1]) ? (req.body.item[i-1].region) : "" } );
    connection.send( { Function: 'SetText' , Input: "result" , SelectedName: 'result '+[i]+'.Text', Value: (req.body.item[i-1]) ? req.body.item[i-1].result : "" } );
  }

  for (let i=1; i<=10; i++) {
    connection.send( { Function: 'SetText' , Input: "startlist" , SelectedName: 'place '+[i]+'.Text',  Value: startIndex*10+i } );
    connection.send( { Function: 'SetText' , Input: "startlist" , SelectedName: 'num '+[i]+'.Text', Value: (req.body.item[i-1]) ? (req.body.item[i-1].number) : "" } );
    connection.send( { Function: 'SetText' , Input: "startlist" , SelectedName: 'name '+[i]+'.Text', Value: (req.body.item[i-1]) ? (req.body.item[i-1].name) : "" } );
    connection.send( { Function: 'SetText' , Input: "startlist" , SelectedName: 'city '+[i]+'.Text', Value: (req.body.item[i-1]) ? (req.body.item[i-1].region) : "" } );
    connection.send( { Function: 'SetText' , Input: "startlist" , SelectedName: 'result '+[i]+'.Text', Value: (req.body.item[i-1]) ? req.body.item[i-1].result : "" } );
  }
})

app.post('/updateData',(req,res)=> {
  getathletsjson(apiUrl);
}) 

app.post('/vmixCommand', (req,res)=> {
  console.log( req.body.data )

  switch ( req.body.data ) {
    case "lider":
      connection.send( { Function: 'SetText' , Input: "lider" , SelectedName: 'place 1.Text',  Value: 1 } );
      connection.send( { Function: 'SetText' , Input: "lider" , SelectedName: 'num 1.Text', Value: sortedathletes[0].number } );
      connection.send( { Function: 'SetText' , Input: "lider" , SelectedName: 'name 1.Text', Value: sortedathletes[0].name  } );
      connection.send( { Function: 'SetText' , Input: "lider" , SelectedName: 'city 1.Text', Value: sortedathletes[0].region  } );
      connection.send( { Function: 'SetText' , Input: "lider" , SelectedName: 'result 1.Text', Value: sortedathletes[0].result  } );
      connection.send( { Function: 'OverlayInput1' , Input: 'lider' } );
    res.send('ok');

    break; 
    case 'lider4':
      console.log( 'lider 4 in ')
      for (let k=1; k<=4; k++) {
        connection.send( { Function: 'SetText' , Input: "lider4" , SelectedName: 'place '+[k]+'.Text',  Value: k } );
        connection.send( { Function: 'SetText' , Input: "lider4" , SelectedName: 'num '+[k]+'.Text', Value: sortedathletes[k-1].number } );
        connection.send( { Function: 'SetText' , Input: "lider4" , SelectedName: 'name '+[k]+'.Text', Value: sortedathletes[k-1].name  } );
        connection.send( { Function: 'SetText' , Input: "lider4" , SelectedName: 'city '+[k]+'.Text', Value: sortedathletes[k-1].region  } );
        connection.send( { Function: 'SetText' , Input: "lider4" , SelectedName: 'result '+[k]+'.Text', Value: sortedathletes[k-1].result  } );
      }
      connection.send( { Function: 'OverlayInput1' , Input: 'lider4' } );
    break;

    default:
    res.send('ok')
  } 
})



connection.on('connect', () => {
  console.log('vMix Connected!')
})

getathletsjson(apiUrl);