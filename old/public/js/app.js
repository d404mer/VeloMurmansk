


var vmixIinputs = [];
Vue.createApp( {
	
	data() {
		return {
			counter: 0,
			sheet1: [12, 22, 32],
			sheet2: [12, 22, 32],
			selectedItem : 0,
			runnedArray: [], 
		}
	},
	methods: {

	clickItem( item , index ) {
		let data = { item: item , index: index }
		console.log( data )
		this.selectedItem = index; 
		axios.post( '/row1', data)
			.then( (res) => {
				markSelectedItem ()
			})
	},

	vmixCommand( com ) {
		console.log( com )
		let data = { data : com }
		axios.post( '/vmixCommand', data)

		if ( com == "titleOn") {
			let runned = this.selectedItem
			$( 'li#'+runned +'.list-group-item' ).addClass('inactive')
			var duration = 3000 ; 
			var seconds = 0;
			clearInterval( interval)
			var interval = setInterval( ()=> {
				seconds += 100; 
				if ( seconds > duration) {
					clearInterval( interval ) ;
					let data = { data : 'titleOUT' }
					axios.post( '/vmixCommand', data)
					$( 'div#' +runned+'.progressbar').width( '0%' );
					$( 'div#' +runned+'.countdown').text( 'finish')
					$( 'div#' +runned+'.countdown').css( 'color', 'green')
				} else { 
					let percent = Math.round( (seconds/duration)*100 );
					console.log( percent )
					let delta = (duration-seconds)*0.1
					$( 'div#' +runned+'.progressbar').width( percent+'%' )
					$( 'div#' +runned+'.countdown').text( Math.floor( delta*0.01 ) +':'+ delta.toString()%100 )
				}
			} , 100 )
		}

		if ( com == 'titleOUT') {
			$( 'div#' +this.selectedItem+'.progressbar').width( '0%' );
			clearInterval( interval)
		}
	},


	getState(){
		var thisMain = this;
		axios.post('/sheet1')	
			.then( (res) => { 
				console.log( res.data )
				const groupedAthletes = chunkArray(res.data , 10);
				console.log( groupedAthletes )
				this.sheet1 = groupedAthletes;
			})

		markSelectedItem ()

	}

	},

	// запуск функции перед загрузкой 
	beforeMount(){
   		this.getState();
   		setInterval( ()=> {
   			markSelectedItem()
   		} , 1000)
 	},


} ).mount('#app')

function markSelectedItem () {
	// axios.post('/getSelectedItem')
	// 	.then( (res)=> {
	// 		console.log( res.data )
	// 		$( 'li.list-group-item.active').removeClass('active') 
	// 		$( 'li#'+res.data +'.list-group-item' ).addClass('active ')
	// 	})
}


function chunkArray(array, chunkSize) {
    const resultArray = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        resultArray.push(array.slice(i, i + chunkSize));
    }
    return resultArray;
}

