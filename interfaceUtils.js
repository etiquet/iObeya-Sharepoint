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
	if (! /\d{1,2}[\/]\d{1,2}[\/]\d{2,4}/.test(date) )
			if (! /\d{1,2}[\ ]\d{1,2}[\ ]\d{2,4}/.test(date) ) 
				if (! /\d{1,2}[\-]\d{1,2}[\-]\d{2,4}/.test(date) )
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
										day=day.toString();
										month=month.toString();

										if (day.length <2) day= "0"+day.toString();
										if (month.length <2) month= "0"+month;
									
									return day +"/" + month +"/" + year.toString();

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
										day=day.toString();
										month=month.toString();

										if (day.length <2) day= "0"+day.toString();
										if (month.length <2) month= "0"+month;
									
										return day +"/" + month +"/" + year.toString();
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
	var msg = 'Request failed. ' + args.get_message() + '\n' + args.get_stackTrace();
	alert(msg);
	console.log(msg);
	// Réactivation du bouton
	enableButton();
    lockSync = false;
	window.location.reload() ; // rafraichi la page après l'erreur
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

/**
 * À partir de l'identifiant 'syncID', crée les variables globales définies dans SYNC_PROPERTIES_MAP
 * @param syncID String: jeu de paramètres de SYNC_PROPERTIES_MAP.
 * Si omis ou invalide, est mis à la valeur 'default'
 * @throws InterfaceException: Le jeu de propriétés 'syncID' n'existe pas
 */
function loadSyncConf(syncID) {

	if(! SYNC_PROPERTIES_MAP.hasOwnProperty(syncID)) {
		throw new InterfaceException("Le jeu de propriétés '"+syncID+"' n'existe pas");
	}

	try {
		var syncMap = SYNC_PROPERTIES_MAP[syncID];

		// On charge d'abord les propriétés héritées
		if(syncMap.hasOwnProperty('inherits') && syncMap.inherits) {
			loadSyncConf(syncMap.inherits); // Du récursif, pas de soucis car peu de profondeur
		}

		// On a un objet sans parent : report des propriétés trouvées dans des variables globales de même nom
		var underscoresCapitals = /^[A-Z_]*$/; // On n'authorise que les majuscules et les underscores
		for(var property in syncMap) {
			if(! syncMap.hasOwnProperty(property) // Lève un warning d'inspection de code...
				|| ! property.match(underscoresCapitals) )
				continue;

			if(syncMap[property].constructor === Object) {
				// Si la variable globale 'property' n'existe pas, on la crée
				// > window[x] = 12; équivaut à > x = 12; avec x variable globale
				if(!window.hasOwnProperty(property)){
					window[property] = {};
				}
				for(var i in syncMap[property]) {
					if(! syncMap[property].hasOwnProperty(i)) continue; // Lève un warning d'inspection de code...
					// > window[property][i] équivaut (par ex.) à SHAREPOINTLIST_MATCHINGNAME['actor']
					window[property][i] = syncMap[property][i];
					// Exemple d'effet réel de la ligne ci-dessus :
					//SHAREPOINTLIST_MATCHINGNAME = SYNC_PROPERTIES_MAP[syncID]['SHAREPOINTLIST_MATCHINGNAME'];
				}
			}
			else if(syncMap[property].constructor === String
					|| syncMap[property].constructor === Array) {
				window[property] = syncMap[property];
			}
		}
	} catch(e) {
		throw e;
	}
	// On a fait le mapping des propriétés trouvées.
	// Si on est dans un appel récursif, la continuité de la fonction appelante va écraser/créer des propriétés
}