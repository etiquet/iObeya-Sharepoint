/* 

InterfaceSynciObeya est le fichier coeur / démarrage de la synchro

la methode startSync()  est le point d'entrée qui appelée depuis le bouton iObeya dans le bandeau Sharepoint


La logique générale (fonctions clées) est la suivante :

 startSync()
 	- connection au sharepoint 
	- récupération des éléments de la liste sharepoint et de la taxonomie des acteurs (liste d'acteurs distinctes de la base de compte)
	- appel de la fonction checkin ci-dessous en précisant que la fonction de synchro est ; syncNotes
	(depuis function onGetQuerySucceeded(sender, args) {) dans interfacegetItems.js )
	
	
checkIn(syncMethod) {	 
	- récupération des éléments de la Room iObeya (login/getrooms/getboards/getnodes ) (voir manuel developpeur iObeya v.3.4 )
	- puis lancement de la méthode de synchro "syncMethod" ( dans notre cas ici  )

NOTE : cette fonction est appelée également par callrefreshActors.js , ce qui explique le passage de la fct de synchro en parramètre

syncNotes()
	- gestion générale de la synchronisation des notes entre le RIDA et les panneaux iObeyas

compareforSyncAction() 
	- identification des changemements à mettre en oeuvre > creation d'une synclist  :  )
	- validation /refus de l'utilisateur (ex: gestion du risque si un volume est trop important )
	

performSyncAction () 
	- mise en oeuvre de la synclist : 
	- traitement des erreurs (mise à jours du status de la sync dans la liste sharepoint)
	- information à l'utilisateur sur les statistiques de la synchro
	- clean-up / fin
	
Note: la mise à jour d'iObeya est effectuée en block à la fin, un array elementsToCommit est créé contenant l'ensemble des créations / updates dans iObeya à gérer

Comme le script est écrit en Javascript de nombreux mécanismes de gestion de l'asynchrone sont en place, 
par exemple un timer de supervision d'attente des threads de fin

*/


/*** 

	Déclarations... 
	Note : pensez que le fichier interfaceConfig.js est inclus dans les en-tete http, 
	il contient des variables générales comme le nom de la room / du sharepoint ainsi que des tableaux de correspondances
	les Labels sont en MAJUSCULES pour différentiation dans le code
	
***/


/*** Status synchronisation ***/

var todo_nothing = 0;
var todo_createiObeya = 1;
var todo_createRida = 2;
var todo_synciObeya = 3;
var todo_syncRida = 4;
var todo_removeiObeya = 5;
var todo_removeRida = 6;
var todo_moveBoardiObeya = 7;

var status_todo = 0x10;
var status_done = 0x20;
var status_failed = 0x30;
var status_nil = 0x50;

var synchro_status_done = "OK";
var synchro_status_failed = "Erreur";
var synchro_status_nil = "";

/*** Types d'affichage ***/

var display_list = 0;
var display_stack = 1;

/*** Variables globales du script ***/

var clientContext; //= new SP.ClientContext(SITEURL);
var oList;
var ridaNodes = [];
var g_syncList = [];
var notificationID;
var lockSync;

var g_allThreads = false;
var g_nodesToCreate = [];
var g_nodesToUpdate = [];
var g_nodesToTrash = [];
var g_rollsToRefresh = [];

var g_syncErrors = 0;
var g_actorsTermsList = [];

var g_iO_rooms = null;
var g_iO_activeRoom = null;
var g_iO_boards = null; 
var g_defaultboard_index = null;  // l'iO_boardsIndex par défaut est calculé lors du processing initial de la liste des boards.

var iO_clientId = null;
var iO_cookie = null;
var iO_nodes = [];

/**
 * Synchronisation
 */

/*** Initialisation de synchronisation avec iObeya ***/
function startSync() { // fonction appelée depuis le bouton iObeya
	try {
		if (lockSync == true) 
			throw new InterfaceException("Une autre instance est déjà en cours, veuillez patienter.\nlockSync==true");
        // Pour détecter qu'une autre thread est active
        // la valeur false est positionnée après l'affichage du pop-up de fin.
        lockSync=true; 
        disableButton();
		refreshTable();     // Rafraîchissement de la vue    
		
        // Mise à jour de la liste des données RIDA
		ExecuteOrDelayUntilScriptLoaded(function () {
			clientContext  = new SP.ClientContext.get_current(); // le contexte ne peut être récupéré que si le script sp.js est loadé.
			//clientContext  = new SP.ClientContext(SITEURL); // méthode alternative
			oList = clientContext.get_web().get_lists().getByTitle(LISTSHAREPOINT_TITLE);
			ridaNodes = retrieveListItems();
			retrieveActorsList_sync();
		}, "sp.js");
	}
	catch (e) {
		// On informe l'utilisateur de la raison de l'erreur
		displayException(e);
		
		// Réactivation du bouton
		enableButton();
        lockSync=false;
			}
}

/*** 
	Action de synchronisation avec iObeya 

	cette fonction est appelée en cascade via un passage de parramètre via
		checkIn(syncMethod) qui est appelé par onGetQuerySucceeded(sender, args) {) dans interfacegetItems.js

***/



function syncNotes(iObeyaNodes){

	try {
		console.log("RIDA lines :");
		console.log(ridaNodes);
		console.log("iObeya notes :");
		console.log(iObeyaNodes);

	
		// Détermination des actions à effectuer
		// résultat dan la variable globale
		
		if ( !verifieActorsList_sync() ) { // on arrête
			enableButton();					// Réactivation du bouton
        	lockSync=false;
			window.location.reload() ; // rafraichi la page après l'erreur ( la liste à mal été chargée )
			return ; // on sort
		}
		
	    g_syncList = compareforSyncAction(ridaNodes,iObeyaNodes, null);
	    
	    if (g_syncList == false) {
	    	enableButton();
            lockSync = false;
	    } else {
		    
		      // Synchronisation
		      g_syncList = performSyncAction(ridaNodes,iObeyaNodes,g_syncList);
		      
		      // Lancement des mises à jours iObeya
			  // la suppression se fait en premier

			  if (g_nodesToTrash.length > 0){
				  	createiObeyaNodeInTrash(iObeyaNodes,g_nodesToTrash,null);
			  }

			  if (g_nodesToUpdate.length > 0)
			  		updateiObeyaNode(g_nodesToUpdate);
			  if (g_nodesToCreate.length > 0)
				  createiObeyaNode(g_nodesToCreate,null);
			
			 if (g_syncList.length > 0)
				 			executeCommit();// Commit changements Sharepoint
			 
		  }
	}
	catch (e) {
		// On informe l'utilisateur de la raison de l'erreur
		displayException(e);
		
		// Réactivation du bouton
		enableButton();
        lockSync=false;
	}
}


/*** Crée la liste des objets à synchroniser ***/
function compareforSyncAction(nodesRida, nodesiObeya){

	var loc_synclist = [];
	var iObeyaObject;
	var ridaObject;
	var syncObject;
	
	try {
		// Parcours RIDA puis iObeya	
		for (var inRida=0; inRida < nodesRida.length; inRida++){ // boucle éléments du rida
			syncObject = null;
			ridaObject = nodesRida[inRida]; // 
			iObeyaObject = getiObeyaObjectById(nodesiObeya, ridaObject.idiObeya);
			
			if (ridaObject.synchroiObeya === undefined) {
				throw new InterfaceException("Le champ \"synchroiObeya\" ne figure pas dans la liste des champs RIDA à synchroniser.");
			}
			if (ridaObject.idiObeya === undefined) {
				throw new InterfaceException("Le champ \"idiObeya\" ne figure pas dans la liste des champs RIDA à synchroniser.");
			}
			
			if (iObeyaObject == null) {
				if (ridaObject.synchroiObeya == true && ridaObject.status != DELETED_STATUS) {
					if (ridaObject.idiObeya == null || ridaObject.idiObeya == ""){
						// Cas n°1 : création d'un nouveau post-it dans iObeya
						syncObject = getSyncObject(todo_createiObeya, ridaObject.idRida, -1, status_todo);   
					}
					else {
						// Cas n°2 : désynchronisation de la tâche RIDA
						syncObject = getSyncObject(todo_removeRida, ridaObject.idRida, -1, status_todo);
					}
				}
			}
			else {
				noteModificationDate = getNoteLastModificationDate(iObeyaObject, nodesiObeya);

				if (ridaObject.synchroiObeya == true && ridaObject.status != DELETED_STATUS
					&& (ridaObject.modificationDate == null || noteModificationDate == null || (Math.abs(ridaObject.modificationDate - noteModificationDate) > TOLERANCEINTERVAL))
					) {
					if (ridaObject.modificationDate > noteModificationDate) {
						// Cas n°3 : mise à jour iObeya
						syncObject = getSyncObject(todo_synciObeya, ridaObject.idRida, iObeyaObject.id, status_todo);				
					}
					else {
						// Cas n°4 : mise à jour RIDA
						syncObject = getSyncObject(todo_syncRida, ridaObject.idRida, iObeyaObject.id, status_todo);
					}
				}
				else if (ridaObject.status == DELETED_STATUS || ridaObject.synchroiObeya == false) {
					// Cas n°5 : passage du post-it en corbeille
					syncObject = getSyncObject(todo_removeiObeya, ridaObject.idRida, iObeyaObject.id, status_todo);
				}
			}
			
			if (syncObject != null) {
				loc_synclist.push(syncObject);
			}
		}
		
		/* 
			Parcours de l'array iObeya en mémoire
			Traitement des éléments iObeya qui diffèrent
			2 cas sont seulements traités : 
				- création d'une entrée RIDA
				- déplacement d'une note dans un autre tableau ( possibilité nouvelle en multipanneau )
				- le cas ou on bouge un post-it sur les panneaux (ex: via la création / suppresssion ou bien via la zone d'échange ) est traité naturellement.
		*/
		
		
		for (var iniObeya=0; iniObeya < nodesiObeya.length; iniObeya++){
			iObeyaObject = nodesiObeya[iniObeya];
			
			if (iObeyaObject['@class'] === "com.iobeya.dto.BoardNoteDTO") {
				syncObject = null;
		  		ridaObject = getRidaObjectByiObeyaId(nodesRida, iObeyaObject.id);
							
				if (ridaObject == null) { // Cas n°7 : création de tâche dans RIDA
		  			syncObject = getSyncObject(todo_createRida, -1, iObeyaObject.id, status_todo);
		  			loc_synclist.push(syncObject);
		  		
				} else {
					

					if ( ridaObject.PanneauiObeya.toLowerCase() != iObeyaObject.boardname.toLowerCase() ){ // Cas n°9 : déplacement de panneau
						var found=false;
						
						for (var loop in loc_synclist ){ // on regarde si l'idiObeya n'est pas déjà dans la synclist (cela devrait être le cas...)
							if (loc_synclist[loop].idRida == ridaObject.idRida ){
								loc_synclist[loop].action=todo_moveBoardiObeya; // oui, on le flag juste pour deplacement de panneau
								found=true;
								console.log("Déplacement de panneau trouvé : on change l'action de synchro");
							}		
						}
						
						if (!found){ // l'objet n'a pas été trouvé dans la liste, on l'ajoute pour supression supprime (ce code ne devrait jamais être activé...)
								syncObject = getSyncObject(todo_moveBoardiObeya, ridaObject.idRida, iObeyaObject.id, status_todo);	// on crée un nouvel objet dans la liste
								loc_synclist.push(syncObject);
								console.log("Etrange : l'objet iObeyaObject n'a pas été trouvé dans loc_synclist, ajout d'une entrée");
							}						
						} // if ( ridaObject.PanneauiObeya.toLowerCase() != iObeyaObject.boardname.toLowerCase() )
					} // else if (ridaObject == null) 
				} // c'est une note if (iObeyaObject['@class'] === "com.iobeya.dto.BoardNoteDTO")
			} // loop array d'objets iObeya
		
		// Message de confirmation
		var stats = getStats(loc_synclist);
		
		var statsMessage = "- Sens Rida > iObeya : \n\n" 
							+ stats[todo_createiObeya] 		+ " Note(s) à créer\n" 
							+ stats[todo_synciObeya] 		+ " Note(s) à synchroniser\n" 
							+ stats[todo_removeiObeya] 		+ " Note(s) à placer à la corbeille\n"
							+ stats[todo_moveBoardiObeya] 	+ " Note(s) à changer de panneau\n\n"
					 		+ "- Sens iObeya > Rida : \n\n" 
							+ stats[todo_createRida] 		+ " Tâche(s) à créer\n" 
							+ stats[todo_syncRida] 			+ " Tâche(s) à synchroniser\n" 
							+ stats[todo_removeRida] 		+ " Tâche(s) à désactiver\n" ;

		if (loc_synclist.length){
			
			if (confirm( "Vous avez demandé une synchronisation entre la liste RIDA et le panneau iObeya.\n\n" 
						+ statsMessage 
						+ " \n\nSouhaitez-vous continuer ?\n" 
						)) { 
					return loc_synclist; 
			 } else 
				return false;
		} else {
			alert(  "\n\n *** IL N'Y A PAS D'ELEMENT A SYNCHRONISER ***  \n\n " );		
			return false;
		}
		
	} // try 
	catch(e) {
		throw e;
	}
}


/*** Routage des différents modes de synchronisation possibles ***/
//TODO: evaluer l'opportunité de placer des fonctions qui font une "post-synchro" des objects à l'issus de la première passe de synchro. cf plus bas (ex: si retraitement pendant la synchro)
// cf if( iObeyaObject.toreupdate != undefined ){ empty code.
// idem pour le nom des tableaux RIDA ?

function performSyncAction(nodesRida, nodesiObeya, l_syncList){
	g_allThreads = false;
	g_nodesToCreate = [];
	g_nodesToUpdate = [];
	g_nodesToTrash = [];
	g_rollsToRefresh = [];

	var iObeyaOverlapping;
	
	
	for (var idSync in l_syncList){
    	var syncObject = l_syncList[idSync];
    	
    	if (syncObject.idRida != -1) {
	    	var ridaObject = getRidaObjectByRidaId(nodesRida, syncObject.idRida);
    	}
    	var iObeyaOverlapping = null;
    	if (syncObject.idiObeya != -1) {
	    	var iObeyaObject = getiObeyaObjectById(nodesiObeya, syncObject.idiObeya);
	    	iObeyaOverlapping = findOverlappingElements(iObeyaObject, nodesiObeya);
    	}

		try {
		    switch (syncObject.action){
					
		    	case todo_createiObeya :
					// on calcule l'UI de la nouvelle ressource
					var rand = Math.floor(Math.random() * 1000000);
					var l_uid = 'rida_' + Math.round(new Date().getTime()) +'.' + rand;
		        	var result = createNoteIniObeya(nodesRida, nodesiObeya, ridaObject,l_uid);
		        	g_nodesToCreate = g_nodesToCreate.concat(result);
					syncObject.status = updateSyncStatus(result);
					
		        break;
	
				case todo_synciObeya :
					var result = updateNoteIniObeya(nodesRida, nodesiObeya, ridaObject, iObeyaObject, iObeyaOverlapping);
					g_nodesToUpdate = g_nodesToUpdate.concat(result);
					syncObject.status = updateSyncStatus(result);
		        break;
					
				case todo_createRida :
					
			        var result = createRida(iObeyaObject, nodesiObeya);
			        syncObject.status = status_nil; 
					//syncObject.status = updateSyncStatus(result); // todo: Q: pourquoi pas de gestion du code result ?
					
					// forcer la mise à jour de la note iObeya si retraitement des données charges (ajoute + "/jh xxx" au contenu)
					// a factoriser avec celui de create rida...

					if( iObeyaObject.toreupdate != undefined ){ 
						// TODO: écrire la fonction qui update la note iObeya depuis un objet en mémoire
					}
					
		        break;
	
				case todo_syncRida :
					
					var result = updateRida(syncObject.idRida, iObeyaObject, nodesiObeya);
					syncObject.status = updateSyncStatus(result);
					
					// forcer la mise à jour de la note iObeya si retraitement des données charges (ajoute + "/jh xxx" au contenu)
					// a factoriser avec celui de create rida...
					if( iObeyaObject.toreupdate != undefined ){ 
						// TODO: écrire la fonction qui update la note iObeya depuis un objet en mémoire
					}
					
				break;
	
		        case todo_removeiObeya :
		        	var iObeyaToRemove = [];
		        	iObeyaToRemove.push(iObeyaObject);
		        	if (iObeyaOverlapping != null)
		   				iObeyaToRemove = iObeyaToRemove.concat(iObeyaOverlapping);
		        	var result = ArrayToRemoveIniObeya(iObeyaToRemove, syncObject.idRida);
		   			g_nodesToTrash = g_nodesToTrash.concat(result);
		        	syncObject.status = status_nil;
		        break;
					
				case todo_moveBoardiObeya : // on déplace la note de tableau ( effacement / recréation )

					// on détruit (corbeille) la nouvelle note dans le tableau source (maintien de l'ide RIDA)
					var iObeyaToRemove = [];
		        	iObeyaToRemove.push(iObeyaObject);
					
					// on traite les overlappings objects
		        	if (iObeyaOverlapping != null)
		   				iObeyaToRemove = iObeyaToRemove.concat(iObeyaOverlapping);
					
		        	var result = ArrayToRemoveIniObeya(iObeyaToRemove, syncObject.idRida);
		   			g_nodesToTrash = g_nodesToTrash.concat(result);
										
					// on créé maintenant une nouvelle note dans le tableau de destination (nouvel ID de note)
					
					var rand = Math.floor(Math.random() * 1000000);
					var l_uid = 'rida_' + Math.round(new Date().getTime()) +'.' + rand;
		        	var result = createNoteIniObeya(nodesRida, nodesiObeya, ridaObject,l_uid);
		        	g_nodesToCreate = g_nodesToCreate.concat(result);
					syncObject.status = updateSyncStatus(result);
					
		        break;
					
					
	
		        case todo_removeRida :
					var result = leaveSynchroRida(syncObject.idRida);
			        syncObject.status = status_nil;
		        break;
		    }
	    }
	    catch(e) {
	    	syncObject.status = status_failed;
	    	throw e;
	    }
	    
	    // Mise à jour du statut de synchronisation
	    if (syncObject.status != status_nil) {
			// on met à jour de manière préalable le status sur les erreurs AVANT de lancer la mise à jour d'iObeya
			// lors de la mise à jours via webservice, d'autre checks peuvent être détectés.
	   		updateRidaStatusSync( syncObject.idRida, 
				parseStatus(syncObject.status) // permet de renvoyer un status en texte, et simplifiant les messages pour l'utilisateur
				);
			if ( syncObject.status == status_failed ) // on incrémente le nombre d'erreurs
										g_syncErrors++;
	   	}
	   	
	   	if (idSync == l_syncList.length - 1) {
		   	g_allThreads = true;
	   	}
	}
	
	g_nodesToUpdate = g_nodesToUpdate.concat(g_rollsToRefresh); // g_rollsToRefresh =  forcer le rafraichissement des rolls (bug v3.3 iObeya) en plus des objets

	return l_syncList;
}


/*** Désactivation du bouton (traitement en cours) ***/
function disableButton() {
	varTitle = "Synchronisation en cours...";  
	varMsg = "Veuillez patienter quelques secondes";  
	notificationID = SP.UI.ModalDialog.showWaitScreenWithNoClose(varTitle, varMsg, 120, 500);
}

/*** Réactivation du bouton (fin de traitement) ***/
function enableButton() {
	notificationID.close();
}


/*** Détermine le sens de la synchronisation : RIDA >> iObeya (+1) ou iObeya >> RIDA (-1) ***/
function synchroDirection(nodesRida, nodesiObeya) {

	var maxRidaDate = 0;
	var maxiObeyaDate = 0;

	try {
		$(nodesRida).each(function() {
			if (this.modificationDate === undefined) {
				throw new InterfaceException("Le champ \"modificationDate\" ne figure pas dans la liste des champs RIDA à synchroniser.");
			}		
			maxRidaDate = Math.max(this.modificationDate, maxRidaDate);
		});
		$(nodesiObeya).each(function() {
			maxiObeyaDate = Math.max(this.modificationDate, maxiObeyaDate);
		});
	
		if (maxRidaDate > maxiObeyaDate) return 1;
		return -1;
	}
	catch(e) {
		throw(e);
	}
}



/*** Mise à jour du statut de l'objet Sync suite à une synchronisation ***/
function updateSyncStatus(result) {
	if (result)
		return status_done;
    else
		return status_failed;
}

/*** Formatage du statut pour le rendre intelligible ***/
function parseStatus(status) {
	if (status == status_done)
		return synchro_status_done;
    if (status == status_failed)
		return synchro_status_failed;
	if (status == status_nil)
		return synchro_status_nil;
}

/**
 * Initialisation connexion avec iObeya / récupération des éléments avec iObeya
 */

/*** 

	Authentification 
	Cette fonction est appelé par 2 autres méthode qui précise la function qui fait la synchro

***/

function checkIn(syncMethod) {
var myxmlr = null ;
var response = null;
	
	console.log("Check user connection");

	iO_clientId = null;
	
	myxmlr = new XMLHttpRequest();
	myxmlr.open("GET", IOBEYAURL + "/s/j/messages/in", true);
	myxmlr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded; charset=utf-8');
	myxmlr.withCredentials = true;
	myxmlr.onload = function () {
		try {
			response = JSON.parse(this.responseText);
			if (response.clientId != undefined) {
			    iO_clientId= response.clientId;
		    } else {
				throw new InterfaceException("Erreur à la récupération des données depuis le serveur iObeya à l'emplacement : /s/j/messages/in ");
				enableButton();// Réactivation du bouton
        		lockSync=false;
				window.location.reload() ; // rafraichi la page après l'erreur
			}
		
			getRooms(syncMethod);
		}
		catch(e) {
			displayException(e);
			// Réactivation du bouton
			enableButton();
			window.location.reload() ; // rafraichi la page après l'erreur
		}
		
	};
	myxmlr.onerror = function () {
		displayException(new InterfaceException( "Erreur à la connection à iObeya : êtes-vous bien connecté dans un autre onglet ou fenêtre ?" ));
		
		// Réactivation du bouton
		enableButton();
        lockSync=false;
		window.location.reload() ; // rafraichi la page après l'erreur
	};
	myxmlr.send();
}

/*** Récupération des rooms ***/

/*

NOTE :  IMPORTANT IMPORTANT IMPORTANT cette portion de code fait largement appel à CORS
https://en.wikipedia.org/wiki/Cross-origin_resource_sharing

definition wikipedia : Cross-origin resource sharing (CORS) is a mechanism that allows restricted resources (e.g. fonts) on a web page to be requested from another domain outside the domain from which the first resource was served.[1]

Cela nécessite que le serveur iObeya soit correctement configuré ( ce n'est pas activé par défaut il faut paramétrer le fichier de la Web app. La v3.4 semble améliorer ce point)

CORS execute également un pre-fetch (rerequete) si la requete n'est pas vue comme standard ( post / put / content type non standard )
le comportement des navigateurs est différent selon les versions pour le prefetch, parfois les credentials (cookies) ne sont pas envoyés.
L'erreur est donc un rejet par la plateforme iObeya.

Attention donc à cet aspect.

*/


function getRooms(syncMethod) {
var myxmlr = null;
g_iO_activeRoom = null;
	
	console.log("Fetch rooms");
	g_iO_rooms = new Array();
	
	//myxmlr = getJSONData(IOBEYAURL + "/s/j/rooms"); // TODO: fonction desactivé car difficile à suivre au debug

	myxmlr= new XMLHttpRequest();
	myxmlr.open("GET", IOBEYAURL + "/s/j/rooms", /*true*/ false);// TODO: async = no pour un suivi synchrone et debug facilité
	//myxmlr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded; charset=utf-8');  // TODO: paramètre qui permet de lancer une requete CORS sans pre-request ( requete "standart" )
	myxmlr.setRequestHeader('Content-type', 'application/json'); // declanche un prefetch CORS
	myxmlr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
	myxmlr.withCredentials = true;
	
	myxmlr.onerror = function(e) {
		displayException(new InterfaceException("Une erreur est survenue pendant l'appel de l'url : " + IOBEYAURL + "/s/j/rooms" + "\n Error Status: " + e.target.status));
		enableButton();
        lockSync=false;
		window.location.reload() ; // rafraichi la page après l'erreur
		};
	
	myxmlr.onload = function () {
		try {
			var roomsArray = JSON.parse(this.responseText);
			roomsArray.forEach(function(e) {
				if (e["@class"] === "com.iobeya.dto.RoomDTO") {
					g_iO_rooms.push({"id": e.id, "name": e.name});
				
					// Active room
					if (e.name == ROOM_NAME) {
						g_iO_activeRoom = e;
					}
				}
			});	
		
			if (g_iO_activeRoom == null) {
				throw new InterfaceException("La room \"" + ROOM_NAME + "\" n'existe pas dans iObeya.");
			}
			
			getBoards(syncMethod);
		}
		catch(e) {
			displayException(e);
			// Réactivation du bouton
			enableButton();
		}
		nextRequest();
	};
	myxmlr.send();
	
	//startQueue();
}

/*** Récupération des boards ***/

/*

Note : A la lecture de la nouvelle documentation développeur v3.4, la structure d'un objet board, précise 

{
"@class": "com.iobeya.dto.BoardNoteDTO", "color": 13158655,
"container": {
"@class": "com.iobeya.dto.EntityReferenceDTO", "id": "2b6491b0-9ab4-46e4-94c8-761cda6d1122", "type": "com.iobeya.dto.ElementContainerDTO" },
"contentLabel": "Hello",
"creationDate": 1320075117000,
"creator": "admin",
"fontFamily": null,
"height": 105,
"id": "0b6491b0-9ab4-46e4-94c8-761cda6d1126", "isAnchored": false,
"isLocked": false,
"isReadOnly": false,
"props": {
"content": "Japanese", "title": "",
"responsible": "", "date": ""
},
"linkLabel": "link",
"linkUrl": "http://url", "modificationDate": 1444830172901, "modifier": "superadmin",
"name": "noteName10",
"setName": "Notes",
"width": 150,
"x": 1846,
"y": 1254,
"zOrder": 6
}

Container:thecontainervalueofagivenboardelementisusuallytheelementcontainer associated to a board. 
Instead of sending the board's json object, we need to pass an EntityReferenceDTO with the board element container ID

Il faut utiliser le container.id pour la création, modification d'éléments dans un board(notes / stickers / labels ?)
*/


function getBoards(syncMethod) {
var myxmlr = null;
var boardfound=0;
	
	console.log("Fetch boards");

	g_iO_boards = new Array();
    iO_nodes = new Array();

// TODO: remettre l'appel getJSONData
//	myxmlr = getJSONData(IOBEYAURL + "/s/j/rooms/" + g_iO_activeRoom.id + "/details");
		myxmlr= new XMLHttpRequest();
		myxmlr.open("GET", IOBEYAURL + "/s/j/rooms/" + g_iO_activeRoom.id + "/details", /*true*/ false);// TODO: async = no pour un suivi synchrone et debug facilité
		//myxmlr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded; charset=utf-8');// fonction desactivé car difficile à suivre au debug
		myxmlr.setRequestHeader('Content-type', 'application/json');
		myxmlr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
		myxmlr.withCredentials = true;


		myxmlr.onerror = function(e) {
			displayException(new InterfaceException("Une erreur est survenue pendant l'appel de l'url : " + IOBEYAURL + "/s/j/rooms" + "\n Error Status: " + e.target.status));
			// Réactivation du bouton
			enableButton();
			lockSync=false;
			window.location.reload() ; // rafraichi la page après l'erreur
			};

		myxmlr.onload = function () {
			try {
				var roomElementsArray = JSON.parse(this.responseText); // la réponse donne la liste des boards
				
				roomElementsArray.forEach(function(elmnt) {
					if (elmnt["@class"] === "com.iobeya.dto.BoardDTO") { // filtrage par type
						// Get active board, sur variable de paramétrage : boardList 

						BOARDSTOSYNC.forEach( function(board) { 
                        // on vérifie que le panneau doit être synchronisé
							if (elmnt.name == board) {
								console.log(" found configured nameBoard: \"" + elmnt.name);
								g_iO_boards.push(elmnt); // on ajoute la board dans l'array
								if ( elmnt.name === BOARDSTOSYNC[0] ) // on determine quelle l'id de la board par defaut dans l'Array de configuration.
									g_defaultboard_index=g_iO_boards.length-1;
								boardfound++;
								getNodes(syncMethod, elmnt.id, elmnt.name);
							}
						});
						
					}

				});

			} catch(e) {
				displayException(e);
				// Réactivation du bouton
				enableButton();
			}

		};
	
		//startQueue();
		myxmlr.send(); // on lance l'appel de la méthode assynchrone.

		// TODO: approfondir les tests ici et crier si nécessaire
		// véridier si l'on a bien le nombre de board attendu ou s'il en manque...
		// vérifier si g_defaultboard_index n'est pas vide
    
        console.log(boardfound);
        console.log(BOARDSTOSYNC.length)
        console.log(g_defaultboard_index);
        if (boardfound != BOARDSTOSYNC.length) {
            throw new InterfaceException("Le nombre de tableaux à synchroniser est différent du nombre de tableaux attendus");
        }
        
        if ( g_defaultboard_index == null ) {
            throw new InterfaceException("Aucun tableau n'a été sélectionné");
        }

		if (boardfound == 0) { // pas de board trouvé, on arrête.
				throw new InterfaceException("Aucun tableau specifié dans le fichier de configuration n'a été trouvé dans la Room : " + board + ", vérifiez la configuration ");
		}

	
    syncMethod(iO_nodes); // on lance la synchro
    nextRequest(); // on dépile la queue
}

/*** Récupération des éléments ***/

function getNodes(syncMethod, l_boardid, boardname) {
var myxmlr = null;
	
	console.log('Getting nodes');	
	myxmlr= new XMLHttpRequest();
	myxmlr.open("GET",IOBEYAURL + "/s/j/boards/" + l_boardid + "/details", /*true*/ false); // TODO: async = no pour un suivi synchrone et debug facilité
	//myxmlr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded; charset=utf-8'); // fonction desactivé car difficile à suivre au debug
	myxmlr.setRequestHeader('Content-type', 'application/json');
	myxmlr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
	myxmlr.withCredentials = true;
	
	myxmlr.onerror = function(e) {
		displayException(new InterfaceException("Une erreur est survenue pendant l'appel de l'url : " + IOBEYAURL + "/s/j/boards/" 
												+ l_boardid + "/details" + "\n Error Status: " + e.target.status));
		// Réactivation du bouton
		enableButton();
        lockSync=false;
		window.location.reload() ; // rafraichi la page après l'erreur
		};
	
	
	myxmlr.onload = function () {
		try {
			var data = JSON.parse(this.responseText);
			var nodes = [];

			for (var i = 0; i < data.length; i++) {
				// Stickers : récupération de l'ID de l'asset

				if (data[i]['@class'] == "com.iobeya.dto.BoardSharedElementDTO") {
					var breakpoint = 1 ; // pour breakpoint
					}
				
				if (data[i]['@class'] == "com.iobeya.dto.StickerToolSetItemDTO") {
					for (var value in PERCENTAGE_IOBEYASTICKER_MAPPING.map) {
						if (PERCENTAGE_IOBEYASTICKER_MAPPING.map[value].name == data[i].label) {
							PERCENTAGE_IOBEYASTICKER_MAPPING.map[value].id = data[i].asset.id;
						}
					}
					for (var value in PRIORITY_IOBEYASTICKER_MAPPING.map) {
						if (PRIORITY_IOBEYASTICKER_MAPPING.map[value].name == data[i].label) {
							PRIORITY_IOBEYASTICKER_MAPPING.map[value].id = data[i].asset.id;
						}
					}
				}
                
                // Stockage des proprietés du tableau en cours
                //if (l_boardid && boardname != null) {
                data[i].boardname=boardname;
                data[i].boardid=l_boardid; // todo: corrigé... boardnameId
               // }

				// Objets dessinables et tri des notes visibles
				if (data[i].hasOwnProperty("zOrder")) { // zorder est la condition pour filtrer un objet visible des panneaux d'autre chose.
			        iO_nodes.push(data[i]);
                    
				}
			}
			
			// sorting with zOrder
			iO_nodes.sort(function(obj1, obj2) {
				return parseInt(obj1.zOrder) - parseInt(obj2.zOrder);
			});
            			
            // mettre ds func 
			//syncMethod(nodes);
			//nextRequest();
		}
		catch(e) {
			displayException(e);
			
			// Réactivation du bouton
			enableButton();
		}
	};
	
	myxmlr.send();
	//startQueue();
}


/*** 
	
	Fonctions de gestion et manipulation des objets iObeya en mémoire
	Ces fonctions reprennent la structure des objects iObeya véhiculés
	par les Web Interfaces. 
	
	Quelques propriétés sont ajoutés pour permettre un debug ou une logique.
	Le WS iObeya ne se pleint pas de recevoir des champs supplémentaires...
	ex: boardid / boardname
	
*** /



 /* Fonctions de synchronisation pour l'édition des éléments RIDA et iObeya
 */
 
/*** Création d'un post-it dans iObeya (initialisation) ***/

function createNoteIniObeya(nodesRida, nodesiObeya, ridaObj,uid){

    var i = 0, l_boardid =null;
	
	try {
		console.log("Création d'un nouveau post-it dans iObeya");
		
		//Permet de récupérer le nom du tableau pour l'objet à créer
		l_boardid=getBoardidFromRidaObj(ridaObj);

		// Zone d'atterrissage
		var roll = findRollbyLabelName(nodesiObeya, ridaObj.status,l_boardid);


		// initialisation de la structure de la note 
		
	    var newNote = {};
		
		// Initialisation de l'object Notes
		
		newNote['@class'] = 'com.iobeya.dto.BoardNoteDTO';
	    newNote.id = uid;
	    newNote.isAnchored = false;
	    newNote.isLocked = false;
	    newNote.linkLabel = "";
	    newNote.linkUrl = "";
	    newNote.name = "";
	    newNote.setName = "";
	    if (ridaObj.creator != null)
		    newNote.creator = ridaObj.creator;
	    newNote.creationDate = ridaObj.creationDate;
	    newNote.x = 0;
	    newNote.y = 0;
	    newNote.zOrder = 0;
		newNote.color = NOTE_DEFAULT_COLOR;
		
		// Place le contenu "coeur de la note" : les 4 champs visibles
		// note : la fonction pourraient évoluer vers d'autre nature de note
		
	    newNote = fillNoteForiObeya(newNote, nodesRida, nodesiObeya, ridaObj); 
		
		
        // Initialisation du container  ( la note est rattachée au "containeur" du board )
		
		/*newNote.container = { // note ce n'est pas l'element container du board mais le elementContainer qu'il faut prendre
	        '@class': 'com.iobeya.dto.EntityReferenceDTO',
	        'id': elementContainer id du board, 
	        'type': 'com.iobeya.dto.BoardDTO'
	    };*/
		
		newNote.container= getBoardElementContainerFromRidaObj(ridaObj);

		// l'id de la board (pas celui du container )
		newNote.boardid = l_boardid; // cette propriété n'est pas standard dans iObeya mais nous l'utilisons pour la logique
		newNote.boardname =getBoardNameFromRidaObj(ridaObj); // cette propriété n'est pas standard dans iObeya mais nous l'utilisons pour la logique
		

        // new properties for interface v3.3
        // note: properties "props" is setted in fillNoteForiObeya
        newNote.score = -1;
        newNote.scoreRatio =  -1;
        newNote.asset = null;
        newNote.fontFamily = "arial";
		
        // Récupérer tous les éléments qui chevauchent le post-it
		// on créer les autres éléments dont on a besoin ( jusqu'a 3 éléments )
		
	    var overlappingElements = findOverlappingElements(newNote, nodesiObeya); // retourne le besoin d'éléments superposés
	    
	    try {
			newNote = placeElement(roll, newNote, ridaObj.status, nodesiObeya, overlappingElements);
		}
	    catch (e) {
	    	alert(e.message);
	    	return [];
	    }
        
	    // Etiquette du responsable
	    var newLabel = null;
	    if (ridaObj.actor != null) {
	    	newLabel = createActorLabel(ridaObj);
	    	newLabel = placeLabel(newLabel, newNote);
	    	nodesiObeya.push(newLabel);
	    }
	    
	    // Sticker pourcentage achevé
	    var newPercentage = null;
	    if (ridaObj.percentComplete != null && PERCENTAGE_IOBEYASTICKER_MAPPING.map[ridaObj.percentComplete] != null) {
		    newPercentage = createSticker(ridaObj, ridaObj.percentComplete, PERCENTAGE_IOBEYASTICKER_MAPPING);
		    newPercentage = placePercentCompleteSticker(newPercentage, newNote);
		    nodesiObeya.push(newPercentage);
	    }
	    
	    // Sticker priorité
	    var newPriority = null;
	    if (ridaObj.priority != null && PRIORITY_IOBEYASTICKER_MAPPING.map[ridaObj.priority] != null) {
		    newPriority = createSticker(ridaObj, ridaObj.priority, PRIORITY_IOBEYASTICKER_MAPPING);
		    newPriority = placePrioritySticker(newPriority, newNote);
		    nodesiObeya.push(newPriority);
	    }
 
	    nodesiObeya.push(newNote);
	    
	    var elementsToCreate = [];
	    elementsToCreate.push(newNote);
	    if (newLabel != null)
	    	elementsToCreate.push(newLabel);
	    if (newPercentage != null)
	    	elementsToCreate.push(newPercentage);
	    if (newPriority != null)
	    	elementsToCreate.push(newPriority);

	    updateRida(ridaObj.idRida, newNote, nodesiObeya); // pourquoi ?
	    
	    // Rafraîchissement du rouleau ( correction d'un bug lié au rafraichissement en v3.1 les objets passaient derriere le roll )
	    g_rollsToRefresh = g_rollsToRefresh.concat(roll);

	    return elementsToCreate; // retour la liste des éléments à mettre à jour/ créer dans iObeya
	}
	catch(e) {
		throw e;
	}
}

/*** 

	Mise à jour d'un post-it dans l'objet iObeya

***/


function updateNoteIniObeya(nodesRida, nodesiObeya, ridaObj, iObeyaObj, iObeyaOverlapping){

 try {
		console.log("Mise à jour d'un post-it dans iObeya");	
		
		// on récupère le panneau depuis le RIDA (/!\ il peut avoir changé)
		var l_boardid=getBoardidFromRidaObj(ridaObj);

		// Mise à jour des champs de la NOTE
		// On met à jour le contenu de la note ( par les attributs ex: container, etc...)
		
	    var note = fillNoteForiObeya(iObeyaObj, nodesRida, nodesiObeya, ridaObj); 

		// Mise à jour (en mémoire) des éléments au dessus de la note : pourcentage, priorite, acteurs
		// iObeyaOverlapping est un array() créé via findOverlappingElements( ); créée dans la fonction précédente

		var label = manageLabelUpdate(nodesiObeya, ridaObj, note, iObeyaOverlapping);
		var percentSticker = managePercentCompleteStickerUpdate(nodesiObeya, ridaObj, note, iObeyaOverlapping);
		var prioritySticker = managePriorityStickerUpdate(nodesiObeya, ridaObj, note, iObeyaOverlapping);		
		
		// Il est possible à ce stade que des nouveaux éléments supperposés aient été créés, il faut revérifier la liste
		iObeyaOverlapping = findOverlappingElements(iObeyaObj, nodesiObeya);
		
	    // On gère s'il y a changement de status RIDA (donc de roll) et on modifie la position des notes dans le kanban.
		
    	var iObeyaStatusObj = findNoteStatus(iObeyaObj, nodesiObeya);
    	var roll = findRollbyLabelName(nodesiObeya, ridaObj.status,l_boardid);
    	var move = false;
		
		if (ridaObj.status != iObeyaStatusObj.status) { // le status de l'objet a changé
			
		// Récupérer tous les éléments qui chevauchent le post-it
			
	   	try {
			note = placeElement(roll, note, ridaObj.status, nodesiObeya, iObeyaOverlapping);
				}	
		catch(e) {
				alert(e.message);
				return [];
				}
			}

		// Mise à jour
		var elementsToUpdate = [];
		
		// on ajoute la note à la liste des "elementsToUpdate" (l'update des objets iObeya est traité en fin de processus de synchro)
		elementsToUpdate.push(note); 
		elementsToUpdate = elementsToUpdate.concat(iObeyaOverlapping); // on ajoute les éléments supperposés au commit 
	    updateRida(ridaObj.idRida, note, nodesiObeya);  // TODO: réellement utile ?
	 
	    // Rafraîchissement du rouleau
	    g_rollsToRefresh = g_rollsToRefresh.concat(roll); // pour s'assurer que le rafraissement se fait bien, erratique en 3.1

	    return elementsToUpdate;
	}
	catch(e) {
		throw e;
	}
}

/*** Détermination de l'action à effectuer sur une étiquette "Ressource" (création, modification, suppression) ***/
function manageLabelUpdate(nodesiObeya, ridaObj, note, overlappingElements) {
	var label = getAssociatedLabel(overlappingElements);
	
    if (ridaObj.actor == null && label != null)  {
    	// 1er cas : suppression de l'étiquette du responsable
    	removeiObeyaElement(label.id);
    	removeNodeFromArray(label, nodesiObeya);
    	label = null;
    }
    else if (ridaObj.actor != null && label == null)  {
    	// 2e cas : création de l'étiquette du responsable
    	label = createActorLabel(ridaObj);
    	nodesiObeya.push(label);
    	
    	// Coordonnées de l'étiquette
    	label = placeLabel(label, note);
    }
    else if (ridaObj.actor != null && label != null && ridaObj.actor != label.contentLabel)  {
    	// 3e cas : mise à jour de l'étiquette du responsable
    	label = updateActorLabel(label, ridaObj);
    }
    else {
    	return null;
    }
    
    return label;
}

/*** Détermination de l'action à effectuer sur un sticker "% achevé" (création, modification, suppression) ***/
function managePercentCompleteStickerUpdate(nodesiObeya, ridaObj, note, overlappingElements) {
	var stickerMapping = PERCENTAGE_IOBEYASTICKER_MAPPING;
	var percentSticker = getAssociatedPercentCompleteSticker(overlappingElements);
   
	if (ridaObj.percentComplete == null && percentSticker != null)  {
    	// 1er cas : suppression
    	removeiObeyaElement(percentSticker.id);
    	removeNodeFromArray(percentSticker, nodesiObeya);
    	percentSticker = null;
    }
    else if (ridaObj.percentComplete != null && percentSticker == null)  {
    	// 2e cas : création
    	percentSticker = createSticker(ridaObj, ridaObj.percentComplete, stickerMapping);
    	nodesiObeya.push(percentSticker);
    	
    	// Coordonnées
    	percentSticker = placePercentCompleteSticker(percentSticker, note);
    }
    else if (ridaObj.percentComplete != null && percentSticker != null && percentSticker.name != PERCENTAGE_IOBEYASTICKER_MAPPING.map[ridaObj.percentComplete].name)  {
    	// 3e cas : mise à jour
    	percentSticker = updateSticker(percentSticker, ridaObj, ridaObj.percentComplete, stickerMapping);
    }
    else {
    	return null;
    }
    
    return percentSticker;
}

/*** Détermination de l'action à effectuer sur un sticker "Priorité" (création, modification, suppression) ***/
function managePriorityStickerUpdate(nodesiObeya, ridaObj, note, overlappingElements) {
	var stickerMapping = PRIORITY_IOBEYASTICKER_MAPPING;
	var prioritySticker = getAssociatedPrioritySticker(overlappingElements);
    if (ridaObj.priority == null && prioritySticker != null)  {
    	// 1er cas : suppression
    	removeiObeyaElement(prioritySticker.id);
    	removeNodeFromArray(prioritySticker, nodesiObeya);
    	prioritySticker = null;
    }
    else if (ridaObj.priority != null && prioritySticker == null)  {
    	// 2e cas : création
    	prioritySticker = createSticker(ridaObj, ridaObj.priority, stickerMapping);
    	nodesiObeya.push(prioritySticker);
    	
    	// Coordonnées
    	prioritySticker = placePrioritySticker(prioritySticker, note);
    }
    else if (ridaObj.priority != null && prioritySticker != null && prioritySticker.name != PRIORITY_IOBEYASTICKER_MAPPING.map[ridaObj.priority].name)  {
    	// 3e cas : mise à jour
    	prioritySticker = updateSticker(prioritySticker, ridaObj, ridaObj.priority, stickerMapping);
    }
    else {
    	return null;
    }
    
    return prioritySticker;
}

/*** 

	Remplissage des propriétés d'un post-it dans iObeya 
	Cette méthode ne s'occupe que des propriétés visible.
	Cette méthode pourrait évoluer pour l'objet de type "CardId" en v3.4
	

***/

function fillNoteForiObeya(note, nodesRida, nodesiObeya, ridaObj){

	try {
		// Vérification des informations à récupérer
		
		if (ridaObj.modificationDate == undefined) {
			throw new InterfaceException("Le champ \"modificationDate\" ne figure pas dans la liste des champs RIDA à synchroniser.");
		}
		
		if (ridaObj.creator == undefined) {
			throw new InterfaceException("Le champ \"creator\" ne figure pas dans la liste des champs RIDA à synchroniser.");
		}
		
		if (ridaObj.modifier == undefined) {
			throw new InterfaceException("Le champ \"modifier\" ne figure pas dans la liste des champs RIDA à synchroniser.");
		}
		
		
		// on traite les données
		
		// Traitement du statut (statut par défaut)
		if (ridaObj.status == null) { ridaObj.status = DROP_ZONE; }
		
		// Récupération de la date de modification
	    var updateDate = ridaObj.modificationDate;
		if (updateDate == null) {
			updateDate = new Date().getTime();
		}
		
		// Traitement de la couleur
		if (ridaObj.firmDeadline == true) {
			// Echéance ferme : post-it rouge
			note.color = NOTE_WARNING_COLOR;
		}
		else if (note.color == NOTE_WARNING_COLOR && ridaObj.firmDeadline == false) {
			// Cette tâche n'a plus d'échéance ferme : post-it jaune
			note.color = NOTE_DEFAULT_COLOR;
		}

		// Post-it
	    note.height = NOTE_DEFAULT_HEIGHT;
	    note.width = NOTE_DEFAULT_WIDTH;
        
        
        /* New Method for version 3.3 for iObeya*/
        // TODO : nous avons garder la compatibilité 3.1 en mettant à "" les anciens labels des notes.
        // auparavant v3.1 :>> note.label1 = new Date(ridaObj.startDate).format(dateFormat); 
        
		var contentLabel = "", label0 = "", label1 = "", label2 = "", label3 = "";
		
	    if (ridaObj.subject != null)
	        contentLabel = parseNoteText(ridaObj.subject);
	    if (ridaObj.consomme != null)
	        label0 = ridaObj.consomme.toString().replace(".", ",") + " J/H (Consom.)";
        if (ridaObj.resteafaire != null)
            label1 = ridaObj.resteafaire.toString().replace(".", ",") + " J/H (RAF)";
		if (ridaObj.workload != null)
            label2 = ridaObj.workload.toString().replace(".", ",") + " J/H (Estim)";
	    if (ridaObj.dueDate != null)
	        label3 = new Date(ridaObj.dueDate).format(dateFormat);
        if (ridaObj.modifier != null)
		    note.modifier = ridaObj.modifier;
        
        /* New properties for version 3.3 for iObeya*/

        note.props= {
            'content' : 	contentLabel, 
            'title' : 		label0, // charge en J/H
            'responsible' : label1, // due date 
            'date' : 		label3, // target date
			'workload' :  	label2 // undisplayed label "workload".
        };
        
	    note.modificationDate = updateDate;
	    return note;
	}
	catch(e) {
		throw e;
	}
}

/*** Création d'une étiquette "Responsable" dans iObeya (initialisation) ***/
function createActorLabel(ridaObj) {
	try {

		var l_boardid=getBoardidFromRidaObj(ridaObj);
		
		var newLabel = {};
		newLabel = fillActorLabel(newLabel, ridaObj);
    	newLabel['@class'] = 'com.iobeya.dto.BoardLabelDTO';
    	newLabel.backgroundColor = LABEL_DEFAULT_COLOR;
    	newLabel.creationDate = ridaObj.creationDate;
    	if (ridaObj.creator != null)
	   		newLabel.creator = ridaObj.creator;
	   	newLabel.fontColor = LABEL_DEFAULT_FONT_COLOR;
	   	newLabel.isAnchored = false;
	   	newLabel.isLocked = false;
	   	newLabel.isReadOnly = false;
	   	newLabel.linkLabel = "";
	   	newLabel.linkUrl = "";
	   	newLabel.name = LABEL_DEFAULT_NAME;
		newLabel.setName = LABEL_DEFAULT_SETNAME;
		newLabel.width = LABEL_DEFAULT_WIDTH;
		newLabel.height = LABEL_DEFAULT_HEIGHT;
		newLabel.container = getBoardElementContainerFromRidaObj(ridaObj);
	    newLabel.boardid=l_boardid;
		//Permet de récupérer le nom du tableau pour l'objet à créer

		newLabel.boardid = l_boardid; // cette propriété n'est pas standard dans iObeya mais nous l'utilisons au cas où.
		newLabel.boardname =getBoardNameFromRidaObj(ridaObj);
		
	    return newLabel;
	}
	catch(e) {
		throw e;
	}
}

/*** Mise à jour d'une étiquette "Responsable" dans iObeya (initialisation) ***/
function updateActorLabel(label, ridaObj) {
	try {
		label = fillActorLabel(label, ridaObj);
	    
		var l_boardid=getBoardidFromRidaObj(ridaObj); // on met à jour le boardid au cas où il a changé
		label.container=getBoardElementContainerFromRidaObj(ridaObj);
		label.boardid=l_boardid;
		label.boardname =getBoardNameFromRidaObj(ridaObj);
		
	    return label;
	}
	catch(e) {
		throw e;
	}
}

/*** Remplissage des propriétés d'une étiquette "Responsable" dans iObeya ***/
function fillActorLabel(label, ridaObj) {
	try {
    	label.contentLabel = ridaObj.actor;
	   	if (ridaObj.modifier != null)
	   		label.modifier = ridaObj.modifier;
   		if (ridaObj.modificationDate!= null)
		   	label.modificationDate = ridaObj.modificationDate;
	    
	    return label;
	}
	catch(e) {
		throw e;
	}
}

/*** Création d'un sticker dans iObeya (initialisation) ***/
function createSticker(ridaObj, value, stickerMapping) {
	try {
		var l_boardid=getBoardidFromRidaObj(ridaObj);
		var rand = Math.floor(Math.random() * 100);
		var newSticker = {};
		newSticker = fillSticker(newSticker, ridaObj, value, stickerMapping);
    	newSticker['@class'] = 'com.iobeya.dto.BoardStickerDTO';
    	newSticker.color = 0;
    	newSticker.creationDate = ridaObj.creationDate;
    	if (ridaObj.creator != null)
	   		newSticker.creator = ridaObj.creator;
	   	newSticker.isAnchored = false;
	   	newSticker.isColoredSticker = false;
	   	newSticker.isLocked = false;
	   	newSticker.isReadOnly = false;
		newSticker.width = STICKER_DEFAULT_WIDTH;
		newSticker.height = STICKER_DEFAULT_HEIGHT;
		newSticker.container = getBoardElementContainerFromRidaObj(ridaObj);
		newSticker.boardid=l_boardid;
		newSticker.boardname =getBoardNameFromRidaObj(ridaObj);
	    return newSticker;
	}
	catch(e) {
		throw e;
	}
}

/*** Mise à jour d'un sticker dans iObeya (initialisation) ***/
function updateSticker(sticker, ridaObj, value, stickerMapping) {
	try {
		sticker = fillSticker(sticker, ridaObj, value, stickerMapping);
	    
		var l_boardid=getBoardidFromRidaObj(ridaObj); // on met à jour le boardid au cas où il a changé
		sticker.container=getBoardElementContainerFromRidaObj(ridaObj);
		sticker.boardid=l_boardid;
		sticker.boardname =getBoardNameFromRidaObj(ridaObj);
		
	    return sticker;
	}
	catch(e) {
		throw e;
	}
}

/*** Remplissage des propriétés d'un sticker dans iObeya ***/
function fillSticker(sticker, ridaObj, value, stickerMapping) {
	try {
		if (stickerMapping.map[value].id == null) {
			throw new InterfaceException("Le sticker associé à la valeur \""+value+"\" n'existe pas dans la boîte à outils iObeya.");
		}
	
    	sticker.name = stickerMapping.map[value].name;
    	sticker.setName = stickerMapping.setName;

    	sticker.stickerImage = {
	        '@class': 'com.iobeya.dto.EntityReferenceDTO',
	        'id': stickerMapping.map[value].id,
	        'type': 'com.iobeya.dto.AssetDTO'
	    };
		

	   	if (ridaObj.modifier != null)
	   		sticker.modifier = ridaObj.modifier;
   		if (ridaObj.modificationDate!= null)
		   	sticker.modificationDate = ridaObj.modificationDate;
	    
	    return sticker;
	}
	catch(e) {
		throw e;
	}
}


/*** HELPERS FUNCTIONS *** /
/*** HELPERS FUNCTIONS *** /
/*** HELPERS FUNCTIONS *** /
/*** HELPERS FUNCTIONS *** /
/*** HELPERS FUNCTIONS *** /


/**
 * Manipulation des objets de l'interface
 */

/*** Retourne la tâche de synchronisation demandée ***/

function getSyncObject(action, idRida, idiObeya, status) {

	var syncObject = {};  
	syncObject.action = action;
	syncObject.idRida = idRida;
	syncObject.idiObeya = idiObeya;
	syncObject.status = status ; 
	return syncObject;
}

/*** Retourne l'objet iObeya possédant l'id iObeya renseigné ***/

function getiObeyaObjectById(nodesiObeya, id){

	try {
		for (var i=0; i < nodesiObeya.length; i++){
		    if (nodesiObeya[i].id == id) {
		      	return nodesiObeya[i];
		    }
		}
		return null;
	}
	catch(e) {
		throw(e);
	}
}

/*** Retourne l'objet RIDA possédant l'id iObeya renseigné ***/
function getRidaObjectByiObeyaId(nodesRida, id){

	try {
		for (var i=0; i < nodesRida.length; i++){
		    if (nodesRida[i].idiObeya == id) {
		      	return nodesRida[i];
		    }
		}
		return null;
	}
	catch(e) {
		throw(e);
	}

}

/*** Retourne l'ID dans l'array de l'objet RIDA possédant l'id RIDA renseigné ***/
function getRidaObjectByRidaId(nodesRida, id){

	try {
		for (var i=0; i < nodesRida.length; i++){
			if (nodesRida[i].idRida == undefined) {
				throw new InterfaceException("Le champ \"idRida\" ne figure pas dans la liste des champs RIDA à synchroniser.");
			}
		    if (nodesRida[i].idRida == id) {
		      	return nodesRida[i];
		    }
		}
		return null;
	}
	catch(e) {
		throw(e);
	}
}

/*** Retourne l'id count de l'object RIDA possédant l'id RIDA renseigné ***/
function getRidaIdNumByRidaId(nodesRida, id){

	try {
		for (var i=0; i < nodesRida.length; i++){
			if (nodesRida[i].idRida == undefined) {
				throw new InterfaceException("Le champ \"idRida\" ne figure pas dans la liste des champs RIDA à synchroniser.");
			}
		    if (nodesRida[i].idRida == id) {
		      	return i;
		    }
		}
		return null;
	}
	catch(e) {
		throw(e);
	}
}

/**


/*** Permet de récupérer des attributs d'une board selon l'objet RIDA précisé et place la valeur par défaut le cas échéant***/

function getBoardidFromRidaObj(ridaObj){

     if (ridaObj.PanneauiObeya != null) 	
			for (i in g_iO_boards) { // on scanne la liste globale de node board
				if ( g_iO_boards[i].name.toLowerCase() == ridaObj.PanneauiObeya.toLowerCase())
					return g_iO_boards[i].id;
            }
	
	// le panneau n'est pas précisé dans l'object RIDA ou n'a pas été trouvé
	// utilisation de la valeur par défaut. (sur le premier panneaux du paramétrage)			
	console.log("Warning :  la valeur du panneau de l'entrée RIDA :" + ridaObj.subject +" est vide, utilisation du panneau par défaut : " + g_iO_boards[g_defaultboard_index].name);
	return g_iO_boards[g_defaultboard_index].id;  // valeur par défaut.
}


function getBoardNameFromRidaObj(ridaObj){

     if (ridaObj.PanneauiObeya != null) 	
			for (i in g_iO_boards) { // on scanne la liste globale de node board
				if ( g_iO_boards[i].name.toLowerCase() == ridaObj.PanneauiObeya.toLowerCase())
					return g_iO_boards[i].name;
            }
	
	// le panneau n'est pas précisé dans l'object RIDA ou n'a pas été trouvé
	// utilisation de la valeur par défaut. (sur le premier panneaux du paramétrage)			
	console.log("Warning :  la valeur du panneau de l'entrée RIDA :" + ridaObj.subject +" est vide, utilisation du panneau par défaut : " + g_iO_boards[g_defaultboard_index].name);
	return g_iO_boards[g_defaultboard_index].name;  // valeur par défaut.
}


function getBoardElementContainerFromRidaObj(ridaObj){
     if (ridaObj.PanneauiObeya != null) 	
			for (i in g_iO_boards) { // on scanne la liste globale de node board
				if ( g_iO_boards[i].name.toLowerCase() == ridaObj.PanneauiObeya.toLowerCase())
					return g_iO_boards[i].elementContainer;
            }
	
	// le panneau n'est pas précisé dans l'object RIDA ou n'a pas été trouvé
	// utilisation de la valeur par défaut. (sur le premier panneaux du paramétrage)			
	console.log("Warning :  la valeur du panneau de l'entrée RIDA :" + ridaObj.subject +" est vide, utilisation du panneau par défaut : " + g_iO_boards[g_defaultboard_index].name);
	return g_iO_boards[g_defaultboard_index].elementContainer;  // valeur par défaut.
}


/*** Manipulation de d'array ***/


function removeNodeFromArray(elt, nodesiObeya) {
	for (var i=0; i<nodesiObeya.length; i++) {
		if (nodesiObeya[i] === elt) {
    		nodesiObeya.splice(i,1);
		}
	}
}


/*** Creation d'une liste de Suppression de noeuds dans iObeya ***/
function ArrayToRemoveIniObeya(elements, idRida) {

	var ids = Array();
	for (var i in elements) {
		ids.push(elements[i].id);
	}
	
	//stats(idRida); // TODO: code commenté, pas clair.... ???
		
	return ids;
}

/*** 
	Commit SharePoint en fin de cycle 
	Le charme d'utiliser un navigateur/ javascript est que tout s'execute en asynchrone
	Utilisation d'un timer qui vient checker régulièrement si la thread de commit iObeya a terminé...
	
***/

function executeCommit() {
	// Attendre la fin des process iObeya avant de faire le commit Sharepoint
	window.setInterval(function(){
		if (requestQueue.length == 0 && g_allThreads) {
			// Tous les process iObeya ont été lancés, et tous sont terminés
			g_allThreads = false;
			console.log("Commit SharePoint");
			console.log(clientContext); // Contrôle de l'état de la session SharePoint
			clientContext.executeQueryAsync(Function.createDelegate(this, this.onUpdateQuerySucceeded), Function.createDelegate(this, this.onQueryFailed));
		}
	}, 1000);
}




/*** 
	
	Succès d'une mise à jour RIDA 
	On affiche à l'utilisation les stats sur la synchro

***/



function onUpdateQuerySucceeded() {
	// Trace
    console.log("Update RIDA : success");
    
    SP.UI.Notify.removeNotification(notificationID);

	var stats = getStats(g_syncList); // variable globale
	var statsMessage = 	"- Sens RIDA > iObeya: \n\n" 
						+ stats[todo_createiObeya] 		+ " Note(s) créée(s) \n" 
						+ stats[todo_synciObeya] 		+ " Note(s) synchronisée(s) \n" 
						+ stats[todo_removeiObeya] 		+ " Note(s) à la corbeille \n" 
						+ stats[todo_moveBoardiObeya]  	+ " Note(s) changée(s) de panneau\n\n" 
					 	+ "- Send iObeya > RIDA : \n\n" 
						+ stats[todo_createRida] 	+ " Tâche(s) créée(s)\n" 
						+ stats[todo_syncRida]  	+ " Tâche(s) synchronisée(s)\n" 
						+ stats[todo_removeRida] 	+ " Tâche(s) désactivée(s)\n\n" 
						+ "- Erreurs : \n\n" 
						+ g_syncErrors 	+ " erreur(s) de synchronisation " ;

	// Rafraîchissement
	alert("La synchronisation a été effectuée, statistiques \n\n " + statsMessage);
    lockSync=false;
	document.location.href = RIDALIST_URL;
}

/*** Nombre d'opérations effectuées ***/
function getStats(array) {

	var stats = Array();
	stats[todo_nothing] = 0;
	stats[todo_createiObeya] = 0;
	stats[todo_createRida] = 0;
	stats[todo_synciObeya] = 0;
	stats[todo_syncRida] = 0;
	stats[todo_removeiObeya] = 0;
	stats[todo_removeRida] = 0;
	stats[todo_moveBoardiObeya] = 0;

	for (var i=0; i < array.length; i++) {
		stats[array[i].action]++;
	}

	return stats;
}

/*** Rafraîchissement du tableau RIDA ***/

function refreshTable() {
	var evtAjax = {
		currentCtx: ctx,
		csrAjaxRefresh: true
	};
	
	AJAXRefreshView(evtAjax, SP.UI.DialogResult.OK);
}

/*** 
	
	Récupération de la liste des acteurs de la banque de termes SharePoint 
	
	Précisions:
		les acteurs utilisés ici ne sont pas issus de la base de compte de l'AD du sharepoint
		sinon les acteurs externes à l'organisation ne pourraient pas être traité.
	
	On utilise un termeset / groupeterm qui contient le nom des acteurs.
	
	arborescence :
		Banque taxonomie de la collection de site > termset > termgroup > term(s)
	
	Ces valeurs sont précisées dans le fichier de configration
	mise à jour de "g_actorsTermsList" qui contient une liste à plat
	
	Les appels sont asynchrones...

	D'autre fonctions connexes existent pour la synchronisation des rolls dans les panneaux dans le fichier interfacerefreshactors.js
	//  _sync pour dissocier d'une fonction similaire appelée dans call refreshactor.asp
	
	note : interfacerefreshactors.js n'est pas incluse dans les en-têtes des pages,
	ses methodes ne peuvent pas être appellées directement via le bouton iObeya > inclusion de cette fonction ici.

***/


function retrieveActorsList_sync() { 
    var context, taxonomySession, termStore, parentTerm, terms, termSet,termsEnumerator, currentTerm;

	context = SP.ClientContext.get_current();
	taxonomySession = SP.Taxonomy.TaxonomySession.getTaxonomySession(context);
    termStore = taxonomySession.get_termStores().getById(TAXONOMY_ID);
	g_actorsTermsList = []; // vider le tableau d'objet ( on déréférence l'ancienne valeur )

	/* if (USE_ACTORSSUBSETLIST ==false) { // condition sortie voir plus bas */
	
	termSet = termStore.getTermSet(ACTORSSET_ID); // on utilise le ACTORSSET_ID
	terms = termSet.getAllTerms(); // including chirld
		
	context.load(terms);
	
	context.executeQueryAsync(Function.createDelegate(this, function (sender, args) {
			// fonction Async qui récupère les termes...
			termsEnumerator = terms.getEnumerator();
			// Récupération des termes (acteurs)
			while (termsEnumerator.moveNext()) {
				currentTerm = termsEnumerator.get_current();
				g_actorsTermsList.push(currentTerm);
				}
			}), Function.createDelegate(this, function (sender, args) { alert('The error has occured: ' + args.get_message()); }));
	
} // fin retrieveActorsList_sync


function verifieActorsList_sync (){
	if (!g_actorsTermsList.length )
			if (confirm( "La liste des acteurs (taxonomie Sharepoint) récupérée est vide, souhaitez-vous tenter de la recharger ?" )) { 
					retrieveActorsList_sync();
				if (!g_actorsTermsList.length ) // toujours vide pb...
					if (confirm( "Impossible de recharger la liste, pb de connexion, arrêter ?" )) 
					return false; // on ne traite pas
			 } else  return false; // on ne traite pas
	return true;
}
