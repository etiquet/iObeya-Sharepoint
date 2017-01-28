var requestQueue = [];
var state_queue_processing = 1;
var state_queue_waiting = 0;


/**
 * Gestion des exceptions de l'interface Sharepoint/iObeya
 */

/*** Classe InterfaceException ***/
function InterfaceException(message) {
    this.message = message;
    this.name = "InterfaceException";
}

/*** Affichage d'une exception ***/
function displayException(e) {
	alert("Erreur lors de la synchronisation Sharepoint/iObeya :\n" + e.message);
	console.log(e.message);
}


/**
 * Formatage de données
 */

/*** Ajout d'anti-slashs devant les caractères spéciaux non autorisés ***/
function addslashes(str) {
    return (str + '')
        .replace(/[\\"']/g, '\\$&')
        .replace(/\u0000/g, '\\0');
}

/*** Formatage des données (contrôle des caractères spéciaux) ***/
function parseNoteText(str) {
	str = addslashes(str);
	//str = str.replace(/[^a-z0-9 áàâäãåçéèêëíìîïñóòôöõúùûüýÿæœÁÀÂÄÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝŸÆŒ\s_\-,.?!';]/ig, '');
	
	return str;
}

/*** 
	Formatage de la date (dont le jour et le mois sont inversés lorsque interprétés par navigateur 
	retourne -1 si la date n'est pas bien formatée

***/

function parseDate(date) {
	var l_date, sep, str = date, defyear, defmonth, defday,day,month,year;

	// On calcule l'année par défaut
	defyear= Date.now();

	// on verifie que l'on a une pattern de date
	// JJMMAA JJMMAAAA JJ/MM/AA JJ/MM/AAAA JJ MM AA JJ MM AAAA JJ-MM-AA JJ-MM-AAAA    
	if (! /\d{2}[\/]\d{2}[\/]\d{2,4}/.test(date) )
			if (! /\d{2}[\ ]\d{2}[\ ]\d{2,4}/.test(date) ) 
				if (! /\d{2}[\-]\d{2}[\-]\d{2,4}/.test(date) )
					if (! /\d{6,8}/.test(date) )
						return -1; // erreur sur le format; 

	sep =str.indexOf("/");
	if (sep > 0) {
		l_date=str.split("/"); // décomposition
		} else 	{
			sep =str.indexOf("-");
			if (sep > 0) {
					l_date=str.split("-"); // décomposition
				} else {
						sep =str.indexOf(" ");
						if (sep > 0) {
							l_date=str.split(" "); // décomposition
						
						} else {
							// on test si 6 ou 8 chiffre qui se suivent
							var reg=/[0-9]+/g; // on ne garde que les chiffres
							var date = reg.exec(date).toString();
							
							if (date.length ==8 ){
									var day=parseInt(date.substr(0,2));
									var month=parseInt(date.substr(2,2));
									if (month>12) month=12;
									if (month<1) month=1;
									if (day>31) day=31;
									if (day<1) day=1;
									var year=parseInt(date.substr(4,4));
									
									return day.toString() +"/" + month.toString() +"/" + year.toString();

								} else if (date.length ==6 ){
										var day=parseInt(date.substr(0,2));
										var month=parseInt(date.substr(2,2));
										if (month>12) month=12;
										if (month<1) month=1;
										if (day>31) day=31;
										if (day<1) day=1;
										var year=parseInt(date.substr(4,2));
										var y2= new Date;
										y2= parseInt(y2.getFullYear());
										year= Math.round(y2/100)*100+year;  // on prend centaibe  courante
										
										return day.toString() +"/" + month.toString() +"/" + year.toString();
									}
						// else

						return -1; // erreur sur le format; 
					}
				}
		} 
	
	// on regarde combien de block, 1 block = jour, 2 block = jour / mois, 3 block jour / mois / année.
		//.getFullYear()

	switch(l_date.length){
		
		case 3:
			var day=parseInt(l_date[0]);
			var month=parseInt(l_date[1]);
			if (month>12) month=12;
			if (month<1) month=1;
			if (day>31) day=31;
			if (day<1) day=1;
			day=day.toString();
			month=month.toString();

			if (day.length <2) day= "0"+day.toString();

			if (month.length <2) month= "0"+month;
			var year=parseInt(l_date[2]);
			if (year < 100){

				var y2= new Date;
				y2= parseInt(y2.getFullYear());
				year= Math.round(y2/100)*100+year;  // on prend centaibe  courante

				}

			return day +"/" + month +"/" + year.toString();
        break;
			
		case 2:
			var day=parseInt(l_date[0]);
			var month=parseInt(l_date[1]);
			if (month>12) month=12;
			if (month<1) month=1;
			if (day>31) day=31;
			if (day<1) day=1;
			day=day.toString();
			month=month.toString();

			if (day.length <2) day= "0"+day.toString();
			if (month.length <2) month= "0"+month
			
			var y2= new Date;
			var year=y2.getFullYear();
			return day +"/" + month +"/" + year.toString();

        break;		
		
		default: // pas une bonne date
			return -1; // erreur sur le format.
        break;	

	}
	
	// on regarde combien de block, 1 block = jour, 2 block = jour / mois, 3 block jour / mois / année.
		//.getFullYear()

	switch(l_date.length){
		
		case 3:
			var day=parseInt(l_date[0]);
			var month=parseInt(l_date[1]);
			if (month>12) month=12;
			if (month<1) month=1;
			if (day>31) day=31;
			if (day<1) day=1;
			day=day.toString();
			month=month.toString();

			if (day.length <2) day= "0"+day.toString();

			if (month.length <2) month= "0"+month;
			var year=parseInt(l_date[2]);
			if (year < 100){

				var y2= new Date;
				y2= parseInt(y2.getFullYear());
				year= Math.round(y2/100)*100+year;  // on prend centaibe  courante

				}

			return day +"/" + month +"/" + year.toString();
        break;
			
		case 2:
			var day=parseInt(l_date[0]);
			var month=parseInt(l_date[1]);
			if (month>12) month=12;
			if (month<1) month=1;
			if (day>31) day=31;
			if (day<1) day=1;
			day=day.toString();
			month=month.toString();

			if (day.length <2) day= "0"+day.toString();
			if (month.length <2) month= "0"+month
			
			var y2= new Date;
			var year=y2.getFullYear();
			return day +"/" + month +"/" + year.toString();

        break;		
		
		default: // pas une bonne date
			return -1; // erreur sur le format.
        break;	

	}
	
}



/*** Formatage de la date (dont le jour et le mois sont inversés lorsque interprétés par navigateur ***/
function reverseDate(date) {

	var regex = /^(0[1-9]|[12][0-9]|3[01])[- /.](0[1-9]|1[012])[- /.]((19|20)\d\d)$/;
	var match = date.match(regex);

	if (match === null || match === undefined) {
		return match;
	} else {
		return match[2] + "/" + match[1] + "/" + match[3];
	}

}
/*** Formatage de la charge (valeur attendue : "DECIMAL STRING") ***/
function filterNumbers(workload) { // ne garde que les digits et ,
	var regex = /^([0-9]+(,[0-9]+)?)/, match = workload.match(regex);

	if (match == null || match == undefined) {
		return match;
	} else {
		return match[0].replace(",", "."); // convertit , en . (décimal sharepoint)
	}

}

/**
 * Requêtes AJAX
 */

/*** Erreur d'une requête Sharepoint asynchrone ***/
function onQueryFailed(sender, args) {
	displayException(new InterfaceException('Request failed. ' + args.get_message() + '\n' + args.get_stackTrace()));
	
	// Réactivation du bouton
	enableButton();
    lockSync = false;
}


/*** Fonction qui déclenche la file d'atten ***/
function startQueue() {
	if (requestQueue.length > 0) {
		var elt = requestQueue[0];
		if (elt.state === state_queue_waiting) {
			// Le premier élément n'est pas en cours de traîtement, on le lance
			if (elt.payload !== null) {
				elt.xhr.send(elt.payload);
			} else {
				elt.xhr.send();
			}
			requestQueue[0].state = state_queue_processing;
		}
	}
}

function nextRequest() {
	if (requestQueue.length > 0) {
		requestQueue.splice(0, 1); // Retrait de la première requête
	}
	startQueue(); // Requête suivante
}

/*** Création d'un XMLHttpRequest (requête GET) ***/
function getJSONData(url) {
var l_xmlr= null;
	
	l_xmlr= new XMLHttpRequest();
	l_xmlr.open("GET", url, true); // async = true
	l_xmlr.setRequestHeader('Content-type', 'application/json');
	l_xmlr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
	l_xmlr.withCredentials = true;

	// ajout / lancement de la requete
	requestQueue.push({"xhr": l_xmlr, "payload": null, "state": state_queue_waiting}); 	// insère dans la Queue pour traintement async
	//x.send(); // pour debug, commenter la ligne au dessus
	
	return l_xmlr;
}

/*** Création d'un XMLHttpRequest (requête POST) ***/
function postJSONData(url, payload) {
var l_xmlr = null;
	
	// creation de la requete
	l_xmlr = new XMLHttpRequest();
	l_xmlr.open("POST", url, true);	// async = true
	l_xmlr.setRequestHeader('Content-type', 'application/json');
	l_xmlr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
	l_xmlr.withCredentials = true;
	
	// ajout / lancement de la requete
	requestQueue.push({"xhr": l_xmlr, "payload": payload, "state": state_queue_waiting}); 	// insère dans la Queue pour traintement async
	//x.send(payload); // pour debug, commenter la ligne au dessus
	
	return l_xmlr;
}