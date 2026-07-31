const vMixTCP = require('node-vmix')
const axios = require('axios');
const fs = require('fs');
const bodyParser = require("body-parser");
const { constants } = require('fs/promises');
const vMix = new vMixTCP.ConnectionTCP('192.168.8.157')
const apiUrl = 'https://myfinish.info/php/gate_online.php';
var previousData;


function updateTpl(tpl,name,val) {
  vMix.send( { Function: 'SetText' , Input: tpl , SelectedName: name, Value: val } );
}

function getathletsjson (eventId, challengeId) {
    
    axios.get(apiUrl + '?evid='+eventId+'&d='+challengeId+'&U='+Date())
    .then(response => {
        const data = response.data ;
        const athletes = data.r.map((athlete) => {
          return {
            number: athlete.n,
            name: athlete.i,
            region: athlete.reg,
            score: athlete.s,
            status: athlete.status,
            result: athlete.r,
            laps: athlete.d.laps || [],
            user: athlete.u,
            year: athlete.y,
          };
        });

        var leaders = data.r.map((athlete) => {
            return {
              number: athlete.n,
              name: athlete.i,
              region: athlete.reg,
              score: athlete.s,
              status: athlete.status,
              result: athlete.r,
              laps: athlete.d.laps || [],
              user: athlete.u,
              year: athlete.y,
            };
          });
   
        athletes.sort((a, b) => {
            return a.result - b.result;
        });

        leaders.sort((a,b)=>{
            return b.laps.length - a.laps.length
        })

        let lapsCnt = leaders[0].laps.length-1;
        leaders = leaders.filter((l)=>l.laps.length > lapsCnt)
        leaders.sort((a,b)=>{
            return (a.laps[lapsCnt] || 9999999) - (b.laps[lapsCnt] || 9999999)
        })

        leaders = leaders.splice(0,5)
        
        var lidertime = leaders[0].laps[lapsCnt];
        try { 
            for (let j=1; j< leaders.length ; j++) {
                let del = leaders[j].laps[lapsCnt]-lidertime
                let t = timeformat(del);
                leaders[j].result = t  ? '+'+timeformat(del) : 'НС'
            }
        } catch(err) {}; 
        leaders[0].result = timeformat(leaders[0].laps[lapsCnt])
        //leaders[0].result = leaders[0].laps[lapsCnt]

        lidertime = athletes[0].result;
        try { 
            for (let j=1; j< athletes.length ; j++) {
                let del = athletes[j].result-lidertime
                let t = timeformat(del);
                athletes[j].result = t ? '+'+timeformat(del) : 'НС'
            }
        } catch(err) {}; 
        athletes[0].result = timeformat(athletes[0].result)

        //console.log(leaders)
        //console.log(athletes);
        console.log( athletes.length )


        // update result
        let page = -1;
        for (let i=0; i<50; i++) {
          if (i%10 == 0) page++;
          let offset = page * 10 - 1;
          let title = 'res'+(page+1)
          if (i < athletes.length) {
            let at = athletes[i];
            console.log(at)
            updateTpl(title,'place '+(i-offset)+'.Text',i+1)
            updateTpl(title,'num '+(i-offset)+'.Text',at.number || '')
            updateTpl(title,'name '+(i-offset)+'.Text',at.name || '')
            updateTpl(title,'city '+(i-offset)+'.Text',at.region || '')
            updateTpl(title,'result '+(i-offset)+'.Text',at.result || '')
          } else {
            updateTpl(title,'place '+(i-offset)+'.Text',i+1)
            updateTpl(title,'num '+(i-offset)+'.Text','')
            updateTpl(title,'name '+(i-offset)+'.Text','')
            updateTpl(title,'city '+(i-offset)+'.Text','')
            updateTpl(title,'result '+(i-offset)+'.Text','')
         }
        }


        page = -1;
        for (let i=0; i<50; i++) {
          if (i%10 == 0) page++;
          let offset = page * 10 - 1;
          let title = 'startlist'+(page+1)
          if (i < athletes.length) {
            let at = athletes[i];
            updateTpl(title,'num '+(i-offset)+'.Text',at.number || '')
            updateTpl(title,'name '+(i-offset)+'.Text',at.name || '')
            updateTpl(title,'city '+(i-offset)+'.Text',at.region || '') 
          } else {
            updateTpl(title,'num '+(i-offset)+'.Text','')
            updateTpl(title,'name '+(i-offset)+'.Text','')
            updateTpl(title,'city '+(i-offset)+'.Text','') 

          }
        }

        for (let i=0; i<4; i++) {
          let title = 'liders4'
          if (i < leaders.length) {
            let at = leaders[i];
            updateTpl(title,'num '+(i+1)+'.Text',at.number || '')
            updateTpl(title,'name '+(i+1)+'.Text',at.name || '')
            updateTpl(title,'city '+(i+1)+'.Text',at.region || '') 
            updateTpl(title,'place '+(i+1)+'.Text',i+1)
            updateTpl(title,'result '+(i+1)+'.Text',at.result || '')
 
          } else {
            updateTpl(title,'num '+(i+1)+'.Text','')
            updateTpl(title,'name '+(i+1)+'.Text','')
            updateTpl(title,'city '+(i+1)+'.Text','') 
            updateTpl(title,'place '+(i+1)+'.Text','')
            updateTpl(title,'result '+(i+1)+'.Text','')
          }
        }

          let title = 'lider'
            let at = leaders[0];
            updateTpl(title,'num '+(1)+'.Text',at.number || '')
            updateTpl(title,'name '+(1)+'.Text',at.name || '')
            updateTpl(title,'city '+(1)+'.Text',at.region || '') 
            updateTpl(title,'place '+(1)+'.Text',1)
            updateTpl(title,'result '+(1)+'.Text',at.result || '')
 




        console.log("upd");

        // for (let i=1; i<=10; i++) {
        // 	vMix.send( { Function: 'SetText' , Input: "result" , SelectedName: 'place '+[i]+'.Text', Value: '' } );
        // 	vMix.send( { Function: 'SetText' , Input: "result" , SelectedName: 'num '+[i]+'.Text', Value: '' } );
        // 	vMix.send( { Function: 'SetText' , Input: "result" , SelectedName: 'name '+[i]+'.Text', Value: '' } );
        // 	vMix.send( { Function: 'SetText' , Input: "result" , SelectedName: 'city '+[i]+'.Text', Value: '' } );
        // 	vMix.send( { Function: 'SetText' , Input: "result" , SelectedName: 'result '+[i]+'.Text', Value: '' } );
        // }
     })
    .catch(error => {
        console.error(error)
    })
}

function timeformat( time ) {
  if (isNaN(time) || time>=1000000) return false
	let ms = time%100; 
	let sec = Math.floor(time / 100) % 60;
	let min = Math.floor(time / 6000);
	return min.toString().padStart(2,'0')+":"+sec.toString().padStart(2, '0')+":"+ms.toString().padStart(2, '0'); 
}


vMix.on('connect', () => {
  console.log('vMix Connected!')
})

let updInterval = setInterval(()=>{getathletsjson(5906,14);},5000)




