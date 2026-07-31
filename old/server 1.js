const { ConnectionTCP } = require('node-vmix')
const axios = require('axios');
const fs = require('fs');

const connection = new ConnectionTCP('localhost')


const apiUrl = 'https://myfinish.info/php/gate_online.php?evid=5896&d=12&U=1705493130';

connection.on('connect', () => {
  console.log('vMix Connected!')

	axios.get(apiUrl)
    .then(response => {
        //console.log(response.data);
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
		let delta = athletes[1].result-lidertime;

		try { 
			for (let j=1; j<= athletes.length ; j++) {
					let del = athletes[j].result-lidertime 
					athletes[j].result = '+'+timeformat(del)
				console.log( athletes[j].result)
			}
		} catch(err) {}; 
        

        //console.log(athletes);
        console.log( athletes.length )
        console.log( 'atlets '+ athletes[55].name )



        for (let i=1; i<=10; i++) {
        	console.log( i )
        	connection.send( { Function: 'SetText' , Input: "result" , SelectedName: 'place '+[i]+'.Text', Value: '' } );
        	connection.send( { Function: 'SetText' , Input: "result" , SelectedName: 'num '+[i]+'.Text', Value: '' } );
        	connection.send( { Function: 'SetText' , Input: "result" , SelectedName: 'name '+[i]+'.Text', Value: '' } );
        	connection.send( { Function: 'SetText' , Input: "result" , SelectedName: 'city '+[i]+'.Text', Value: '' } );
        	connection.send( { Function: 'SetText' , Input: "result" , SelectedName: 'result '+[i]+'.Text', Value: '' } );
        }
        

        const itemsPerIteration = 10;
        const delayBetweenIterations = 3000; // в миллисекундах

        let startIndex = 0
        const intervalId = setInterval(() => {
        	 for (let i=1; i<=10; i++) {
        		connection.send( { Function: 'SetText' , Input: "result" , SelectedName: 'place '+[i]+'.Text',  Value: startIndex+i } );
        		connection.send( { Function: 'SetText' , Input: "result" , SelectedName: 'num '+[i]+'.Text', Value: athletes[startIndex+i-1].number } );
        		connection.send( { Function: 'SetText' , Input: "result" , SelectedName: 'name '+[i]+'.Text', Value: athletes[startIndex+i-1].name } );
        		connection.send( { Function: 'SetText' , Input: "result" , SelectedName: 'city '+[i]+'.Text', Value: athletes[startIndex+i-1].region } );
        		connection.send( { Function: 'SetText' , Input: "result" , SelectedName: 'result '+[i]+'.Text', Value: athletes[startIndex+i-1].result} );
        	}
        	startIndex += itemsPerIteration;
        	if (startIndex >= athletes.length) {
        	      clearInterval(intervalId);
        	    }
        	}, delayBetweenIterations);

    })
    .catch(error => {
        console.error
    })

    

})



function timeformat( time ) {
	if (time=="1000000000") return 'HC'
	let seconds = time.toString().slice(0, -2);
	let ms = time%100; 
	let sec = seconds%60;
	let min = Math.floor(seconds / 60);
	return min.toString().padStart(2,'0')+":"+sec.toString().padStart(2, '0')+":"+ms.toString().padStart(2, '0'); 
}