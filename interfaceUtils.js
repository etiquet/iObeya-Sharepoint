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
function parseWorkload(workload) {
	var regex = /^([0-9]+(,[0-9]+)?)/, match = workload.match(regex);

	if (match == null || match == undefined) {
		return match;
	} else {
		return match[0].replace(",", ".");
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