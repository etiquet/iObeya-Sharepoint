/*** Variables globales ***/
var iO_rooms = null;
var iO_activeRoom = null;
var g_iO_boards = null; // ajouté le préfixe g_ pour différentiation dans le code
var g_defaultboard_index = null; // lié au précédent, iO_boardsIndex par défaut est calculé lors du processing initial de la liste des boards.

var iO_clientId = null;
var iO_cookie = null;
var iO_nodes = [];

/*** Status synchronisation ***/
var todo_nothing = 0;
var todo_createiObeya = 1;
var todo_createRida = 2;
var todo_synciObeya = 3;
var todo_syncRida = 4;
var todo_removeiObeya = 5;
var todo_removeRida = 6;

var status_todo = 0x10;
var status_done = 0x20;
var status_failed = 0x30;
var status_nil = 0x50;

var toleranceInterval = 5000;

var synchro_status_done = "OK";
var synchro_status_failed = "Erreur";
var synchro_status_nil = "";

/*** Types d'affichage ***/
var display_list = 0;
var display_stack = 1;

var clientContext; //= new SP.ClientContext(siteUrl);
var oList;
var ridaNodes = [];
var syncList = [];
var notificationID;
var lockSync;

var allThreads = false;
var nodesToCreate = [];
var nodesToUpdate = [];
var nodesToTrash = [];
var rollsToRefresh = [];

var actorsTermsList = new Array();

/**
 * Synchronisation
 */

/*** Initialisation de synchronisation avec iObeya ***/
function startSync() {
	try {
		if (lockSync == true) 
			throw new InterfaceException("Une autre instance est déjà en cours, veuillez patienter.\nlockSync==true");
        // Pour détecter qu'une autre thread est active
        // la valeur false est positionnée après l'affichage du pop-up de fin.
        lockSync=true; 
        disableButton();
		// Rafraîchissement de la vue
		refreshTable();     
	    
		
        // Mise à jour de la liste des données RIDA
		ExecuteOrDelayUntilScriptLoaded(function () {
			clientContext  = new SP.ClientContext.get_current(); // le contexte ne peut être récupéré que si le script sp.js est loadé.
			//clientContext  = new SP.ClientContext(siteUrl); // méthode alternative
			oList = clientContext.get_web().get_lists().getByTitle(listTitle);
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

/*** Action de synchronisation avec iObeya ***/
function syncNotes(iObeyaNodes){

	try {
		console.log("RIDA lines :");
		console.log(ridaNodes);
		console.log("iObeya notes :");
		console.log(iObeyaNodes);

	
		// Détermination des actions à effectuer
	    syncList = compareforSyncAction(ridaNodes,iObeyaNodes);
	    
	    if (syncList == false) {
	    	enableButton();
            lockSync = false;
	    }
	    else {
		    
		      // Synchronisation
		      syncList = performSyncAction(ridaNodes,iObeyaNodes,syncList);
		      
		      // Lancement des mises à jours iObeya
				// TODO demander à vivien pourquoi il appelle les fonctions suivantes même si il n'y avait rien à modifier.
				// les fonctions étaient-elle résilientes à ne rien faire ?
			  if (nodesToCreate.length > 0)
				  createiObeyaNode(nodesToCreate);
			  if (nodesToUpdate.length > 0)
			  		updateiObeyaNode(nodesToUpdate);
			  if (nodesToTrash.length > 0)
					  createiObeyaNodeInTrash(nodesToTrash);

	
			 if (syncList.length > 0) {
			     // Commit changements Sharepoint
			     executeCommit();
			 }
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


/*** Crée la liste des objets à synchroniser ***/
function compareforSyncAction(nodesRida, nodesiObeya){

	var loc_synclist = [];
	var iObeyaObject;
	var ridaObject;
	var syncObject;
	
	try {
		// Parcours RIDA puis iObeya	
		for (var inRida=0; inRida < nodesRida.length; inRida++){
			syncObject = null;
			ridaObject = nodesRida[inRida];
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
					&& (ridaObject.modificationDate == null || noteModificationDate == null || (Math.abs(ridaObject.modificationDate - noteModificationDate) > toleranceInterval))
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
		
		// Parcours iObeya puis RIDA : traitement des éléments iObeya qui ne sont pas dans le RIDA
		for (var iniObeya=0; iniObeya < nodesiObeya.length; iniObeya++){
			iObeyaObject = nodesiObeya[iniObeya];
			if (iObeyaObject['@class'] === "com.iobeya.dto.BoardNoteDTO") {
				syncObject = null;
		  		ridaObject = getRidaObjectByiObeyaId(nodesRida, iObeyaObject.id);
		  		if (ridaObject == null) {
		  			// Cas n°7 : création de tâche dans RIDA
		  			syncObject = getSyncObject(todo_createRida, -1, iObeyaObject.id, status_todo);
		  			loc_synclist.push(syncObject);
		  		}
			}
		}
		
		// Message de confirmation
		var stats = getStats(loc_synclist);
		var statsMessage = "- Sens Rida > iObeya : \n" + stats[todo_createiObeya] + " Note(s) à créer, " + stats[todo_synciObeya] + " Note(s) à synchroniser, " + stats[todo_removeiObeya] + " Note(s) en corbeille. \n"
					 + "- Sens iObeya > Rida : \n" + stats[todo_createRida] + " Tâche(s) à créer, " + stats[todo_syncRida] + " Tâche(s) à synchroniser, " + stats[todo_removeRida] + " Tâche(s) à désactiver. \n\n";

		
		if (confirm("Vous avez demandé une synchronisation entre la liste RIDA et le panneau iObeya.\n\n" + statsMessage + "Souhaitez-vous continuer?\n" )) {
			return loc_synclist;
		}
		else {
			return false;
		}
	}
	catch(e) {
		throw e;
	}
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

/*** Routage des différents modes de synchronisation possibles ***/
//TODO: evaluer l'opportunité de placer des fonctions qui font une "post-synchro" des objects à l'issus de la première passe de synchro. cf plus bas (ex: si retraitement pendant la synchro)
// cf if( iObeyaObject.toreupdate != undefined ){ empty code.
// idem pour le nom des tableaux RIDA ?

function performSyncAction(nodesRida, nodesiObeya, syncList){
	allThreads = false;
	nodesToCreate = [];
	nodesToUpdate = [];
	nodesToTrash = [];
	rollsToRefresh = [];

	for (var idSync in syncList){
    	var syncObject = syncList[idSync];
    	
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
		        	var result = createNoteIniObeya(nodesRida, nodesiObeya, ridaObject);
		        	nodesToCreate = nodesToCreate.concat(result);
					syncObject.status = updateSyncStatus(result);
		        break;
	
				case todo_synciObeya :
					var result = updateNoteIniObeya(nodesRida, nodesiObeya, ridaObject, iObeyaObject, iObeyaOverlapping);
					nodesToUpdate = nodesToUpdate.concat(result);
					syncObject.status = updateSyncStatus(result);
		        break;
					
				case todo_createRida :
					
			        var result = createRida(iObeyaObject, iObeyaOverlapping, nodesiObeya);
			        syncObject.status = status_nil; 
					//syncObject.status = updateSyncStatus(result); // todo: Q: pourquoi pas de gestion du code result ?
					
					// forcer la mise à jour de la note iObeya si retraitement des données charges (ajoute + "/jh xxx" au contenu)
					// a factoriser avec celui de create rida...

					if( iObeyaObject.toreupdate != undefined ){ 
					// TODO: écrire la fonction qui update la note iObeya depuis un objet en mémoire
					}
					
		        break;
	
				case todo_syncRida :
					
					var result = updateRida(syncObject.idRida, iObeyaObject, iObeyaOverlapping, nodesiObeya);
					syncObject.status = updateSyncStatus(result);
					
					// forcer la mise à jour de la note iObeya si retraitement des données charges (ajoute + "/jh xxx" au contenu)
					// a factoriser avec celui de create rida...

					if( iObeyaObject.toreupdate != undefined ){ 
					// TODO: écrire la fonction qui update la note iObeya depuis un objet en mémoire
					}
					
				break;
	
		        case todo_removeiObeya :
		        	var iObeyaToCommit = [];
		        	iObeyaToCommit.push(iObeyaObject);
		        	if (iObeyaOverlapping != null)
		   				iObeyaToCommit = iObeyaToCommit.concat(iObeyaOverlapping);
		        	var result = removeNodeIniObeya(iObeyaToCommit, syncObject.idRida);
		   			nodesToTrash = nodesToTrash.concat(result);
		        	syncObject.status = status_nil;
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
	   		updateRidaStatusSync(syncObject.idRida, parseStatus(syncObject.status));
	   	}
	   	
	   	if (idSync == syncList.length - 1) {
		   	allThreads = true;
	   	}
	}
	
	nodesToUpdate = nodesToUpdate.concat(rollsToRefresh); // rollsToRefresh =  forcer le rafraichissement des rolls (bug v3.3 iObeya) en plus des objets

	return syncList;
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
 * Initialisation connexion avec iObeya
 */

/*** Authentification ***/
function checkIn(syncMethod) {
var myxmlr = null ;
var response = null;
	
	console.log("Check user connection");

	iO_clientId = null;
	
	myxmlr = new XMLHttpRequest();
	myxmlr.open("GET", iObeyaURL + "/s/j/messages/in", true);
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
iO_activeRoom = null;
	
	console.log("Fetch rooms");
	iO_rooms = new Array();
	
	//myxmlr = getJSONData(iObeyaURL + "/s/j/rooms"); // TODO: fonction desactivé car difficile à suivre au debug

	myxmlr= new XMLHttpRequest();
	myxmlr.open("GET", iObeyaURL + "/s/j/rooms", /*true*/ false);// TODO: async = no pour un suivi synchrone et debug facilité
	//myxmlr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded; charset=utf-8');  // TODO: paramètre qui permet de lancer une requete CORS sans pre-request ( requete "standart" )
	myxmlr.setRequestHeader('Content-type', 'application/json'); // declanche un prefetch CORS
	myxmlr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
	myxmlr.withCredentials = true;
	
	myxmlr.onerror = function(e) {
		displayException(new InterfaceException("Une erreur est survenue pendant l'appel de l'url : " + iObeyaURL + "/s/j/rooms" + "\n Error Status: " + e.target.status));
		enableButton();
        lockSync=false;
		window.location.reload() ; // rafraichi la page après l'erreur
		};
	
	myxmlr.onload = function () {
		try {
			var roomsArray = JSON.parse(this.responseText);
			roomsArray.forEach(function(e) {
				if (e["@class"] === "com.iobeya.dto.RoomDTO") {
					iO_rooms.push({"id": e.id, "name": e.name});
				
					// Active room
					if (e.name == ROOM_NAME) {
						iO_activeRoom = e;
					}
				}
			});	
		
			if (iO_activeRoom == null) {
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
function getBoards(syncMethod) {
var myxmlr = null;
var boardfound=0;
	
	console.log("Fetch boards");

	g_iO_boards = new Array();
    iO_nodes = new Array();

// TODO: remettre l'appel getJSONData
//	myxmlr = getJSONData(iObeyaURL + "/s/j/rooms/" + iO_activeRoom.id + "/details");
		myxmlr= new XMLHttpRequest();
		myxmlr.open("GET", iObeyaURL + "/s/j/rooms/" + iO_activeRoom.id + "/details", /*true*/ false);// TODO: async = no pour un suivi synchrone et debug facilité
		//myxmlr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded; charset=utf-8');// fonction desactivé car difficile à suivre au debug
		myxmlr.setRequestHeader('Content-type', 'application/json');
		myxmlr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
		myxmlr.withCredentials = true;


		myxmlr.onerror = function(e) {
			displayException(new InterfaceException("Une erreur est survenue pendant l'appel de l'url : " + iObeyaURL + "/s/j/rooms" + "\n Error Status: " + e.target.status));
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

						boardsToSync.forEach( function(board) { 
                        // on vérifie que le panneau doit être synchronisé
							if (elmnt.name == board) {
								console.log(" found configured nameBoard: \"" + elmnt.name);
								g_iO_boards.push(elmnt); // on ajoute la board dans l'array
								if ( elmnt.name === boardsToSync[0]) // on determine quelle l'id de la board par defaut dans l'Array de configuration.
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
        console.log(boardsToSync.length)
        console.log(g_defaultboard_index);
        if (boardfound != boardsToSync.length) {
            throw new InterfaceException("Le nombre de tableaux a synchronisé est différent du nombre de tableaux attendus");
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
	myxmlr.open("GET",iObeyaURL + "/s/j/boards/" + l_boardid + "/details", /*true*/ false); // TODO: async = no pour un suivi synchrone et debug facilité
	//myxmlr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded; charset=utf-8'); // fonction desactivé car difficile à suivre au debug
	myxmlr.setRequestHeader('Content-type', 'application/json');
	myxmlr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
	myxmlr.withCredentials = true;
	
	myxmlr.onerror = function(e) {
		displayException(new InterfaceException("Une erreur est survenue pendant l'appel de l'url : " + iObeyaURL + "/s/j/boards/" 
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
				if (data[i]['@class'] == "com.iobeya.dto.StickerToolSetItemDTO") {
					for (var value in percentageStickerMapping.map) {
						if (percentageStickerMapping.map[value].name == data[i].label) {
							percentageStickerMapping.map[value].id = data[i].asset.id;
						}
					}
					for (var value in priorityStickerMapping.map) {
						if (priorityStickerMapping.map[value].name == data[i].label) {
							priorityStickerMapping.map[value].id = data[i].asset.id;
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
 * Fonctions de synchronisation pour l'édition des éléments RIDA et iObeya
 */
 
/*** Création d'un post-it dans iObeya (initialisation) ***/
function createNoteIniObeya(nodesRida, nodesiObeya, ridaObj){

    var i = 0, l_boardid =null;
	
	try {
		console.log("Création d'un nouveau post-it dans iObeya");
		
		//Permet de récupérer le nom du tableau pour l'objet à créer
		l_boardid=getBoardidFromRidaObj(ridaObj);

		// Zone d'atterrissage
		var roll = findRollbyLabelName(nodesiObeya, ridaObj.status,l_boardid);
		var rand = Math.floor(Math.random() * 1000000);
		var uid = 'rida_' + Math.round(new Date().getTime()) +'.' + rand;

		// Post-it
	    var newNote = {};
	    newNote.color = NOTE_DEFAULT_COLOR;
	    newNote = fillNoteForiObeya(newNote, nodesRida, nodesiObeya, ridaObj);
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
        newNote.boardid = l_boardid; // cette propriété n'est pas standard dans iObeya mais nous l'utilisons au cas où.
		
        // new properties for interface v3.3
        // note: properties "props" is setted in fillNoteForiObeya
        newNote.score = -1;
        newNote.scoreRatio =  -1;
        newNote.asset = null;
        newNote.fontFamily = "arial";
		
        // Récupérer tous les éléments qui chevauchent le post-it
	    var overlappingElements = findOverlappingElements(newNote, nodesiObeya);
	    
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
	    if (ridaObj.percentComplete != null && percentageStickerMapping.map[ridaObj.percentComplete] != null) {
		    newPercentage = createSticker(ridaObj, ridaObj.percentComplete, percentageStickerMapping);
		    newPercentage = placePercentCompleteSticker(newPercentage, newNote);
		    nodesiObeya.push(newPercentage);
	    }
	    
	    // Sticker priorité
	    var newPriority = null;
	    if (ridaObj.priority != null && priorityStickerMapping.map[ridaObj.priority] != null) {
		    newPriority = createSticker(ridaObj, ridaObj.priority, priorityStickerMapping);
		    newPriority = placePrioritySticker(newPriority, newNote);
		    nodesiObeya.push(newPriority);
	    }
         
	    
		      
	    newNote.container = {
	        '@class': 'com.iobeya.dto.EntityReferenceDTO',
	        'id': newNote.boardid,
	        'type': 'com.iobeya.dto.BoardDTO'
	    };

	    nodesiObeya.push(newNote);
	    
	    var elementsToCommit = [];
	    elementsToCommit.push(newNote);
	    if (newLabel != null)
	    	elementsToCommit.push(newLabel);
	    if (newPercentage != null)
	    	elementsToCommit.push(newPercentage);
	    if (newPriority != null)
	    	elementsToCommit.push(newPriority);

	    
	    updateRida(ridaObj.idRida, newNote, overlappingElements, nodesiObeya);
	    
	    // Rafraîchissement du rouleau
	    rollsToRefresh = rollsToRefresh.concat(roll);

	    return elementsToCommit;
	}
	catch(e) {
		throw e;
	}
}


/*** Mise à jour d'un post-it dans l'objet iObeya (initialisation) ***/
function updateNoteIniObeya(nodesRida, nodesiObeya, ridaObj, iObeyaObj, iObeyaOverlapping){

	try {
		console.log("Mise à jour d'un post-it dans iObeya");
	
		// Mise à jour des champs
	    var note = fillNoteForiObeya(iObeyaObj, nodesRida, nodesiObeya, ridaObj);
		var l_boardid=getBoardidFromRidaObj(ridaObj);
		
	    // Mise à jour des éléments adjacents au post-it
	    var label = manageLabelUpdate(nodesiObeya, ridaObj, note, iObeyaOverlapping);
	    var percentSticker = managePercentCompleteStickerUpdate(nodesiObeya, ridaObj, note, iObeyaOverlapping);
	    var prioritySticker = managePriorityStickerUpdate(nodesiObeya, ridaObj, note, iObeyaOverlapping);
	    
	    // Si le statut a changé, on replace le post-it
    	var iObeyaStatusObj = findNoteStatus(iObeyaObj, nodesiObeya);
    	var roll = findRollbyLabelName(nodesiObeya, ridaObj.status,l_boardid);
		
    	var move = false;
		if (ridaObj.status != iObeyaStatusObj.status) {
			// Récupérer tous les éléments qui chevauchent le post-it
	   		iObeyaOverlapping = findOverlappingElements(note, nodesiObeya);
	   		try {
				note = placeElement(roll, note, ridaObj.status, nodesiObeya, iObeyaOverlapping);
			}
			catch(e) {
				alert(e.message);
				return [];
			}
			move = true;
		}

		// Mise à jour
		var elementsToCommit = [];
		elementsToCommit.push(note);
		if (move) {
			elementsToCommit = elementsToCommit.concat(iObeyaOverlapping);
		}
		else {
			if (label != null)
				elementsToCommit.push(label);
			if (percentSticker!= null)
		    	elementsToCommit.push(percentSticker);
		    if (prioritySticker!= null)
		    	elementsToCommit.push(prioritySticker);
	    }
		
	    updateRida(ridaObj.idRida, note, iObeyaOverlapping, nodesiObeya);
	    
	    // Rafraîchissement du rouleau
	    rollsToRefresh = rollsToRefresh.concat(roll);

	    return elementsToCommit;
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
	var stickerMapping = percentageStickerMapping;
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
    else if (ridaObj.percentComplete != null && percentSticker != null && percentSticker.name != percentageStickerMapping.map[ridaObj.percentComplete].name)  {
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
	var stickerMapping = priorityStickerMapping;
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
    else if (ridaObj.priority != null && prioritySticker != null && prioritySticker.name != priorityStickerMapping.map[ridaObj.priority].name)  {
    	// 3e cas : mise à jour
    	prioritySticker = updateSticker(prioritySticker, ridaObj, ridaObj.priority, stickerMapping);
    }
    else {
    	return null;
    }
    
    return prioritySticker;
}

/*** Permet de récupérer le boardid d'un objet RIDA et place la valeur par défaut le cas échéant***/

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

function removeNodeFromArray(elt, nodesiObeya) {
	for (var i=0; i<nodesiObeya.length; i++) {
		if (nodesiObeya[i] === elt) {
    		nodesiObeya.splice(i,1);
		}
	}
}

/*** Remplissage des propriétés d'un post-it dans iObeya ***/
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
        // TODO : decider que faire avec l'ancienne convention de création de note 'note.labelx', faut-il garder les deux ?
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
        if (ridaObj.PanneauiObeya != null) {
            note.boardid = getBoardidFromRidaObj(ridaObj);
            note.boardname = ridaObj.PanneauiObeya;
        }
        
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
		//Permet de récupérer le nom du tableau pour l'objet à créer
		l_boardid=getBoardidFromRidaObj(ridaObj);
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
		newLabel.container = {
	        '@class': 'com.iobeya.dto.EntityReferenceDTO',
	        'id': l_boardid, // TODO : à remplacer !!!
	        'type': 'com.iobeya.dto.BoardDTO'
	    };
	    
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
		l_boardid=getBoardidFromRidaObj(ridaObj);
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
		newSticker.container = {
	        '@class': 'com.iobeya.dto.EntityReferenceDTO',
	        'id': l_boardid,  // TODO : à remplacer !!!
	        'type': 'com.iobeya.dto.BoardDTO'
	    };

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

/*** Suppression d'une liste de noeuds du board ***/
function removeNodeIniObeya(elements, idRida) {

	var ids = Array();
	for (var i in elements) {
		ids.push(elements[i].id);
	}
	
	leaveSynchroRida(idRida);
		
	return ids;
}

/*** Commit SharePoint en fin de cycle ***/
function executeCommit() {
	// Attendre la fin des process iObeya avant de faire le commit Sharepoint
	window.setInterval(function(){
		if (requestQueue.length == 0 && allThreads) {
			// Tous les process iObeya ont été lancés, et tous sont terminés
			allThreads = false;
			console.log("Commit SharePoint");
			console.log(clientContext); // Contrôle de l'état de la session SharePoint
			clientContext.executeQueryAsync(Function.createDelegate(this, this.onUpdateQuerySucceeded), Function.createDelegate(this, this.onQueryFailed));
		}
	}, 1000);
}

/*** Succès d'une mise à jour RIDA ***/
function onUpdateQuerySucceeded() {
	// Trace
    console.log("Update RIDA : success");
    
    SP.UI.Notify.removeNotification(notificationID);

	var stats = getStats(syncList);
	var statsMessage = "Iobeya: " + stats[todo_createiObeya] + " post-it(s) créé(s), " + stats[todo_synciObeya] + " post-it(s) synchronisé(s), " + stats[todo_removeiObeya] + " post-it(s) en corbeille, \n"
					 + "RIDA" + stats[todo_createRida] + " tâche(s) créée(s), " + stats[todo_syncRida] + " tâche(s) synchronisée(s), " + stats[todo_removeRida] + " tâche(s) désactivée(s).";

	// Rafraîchissement
	alert("Fin de synchronisation\n" + statsMessage);
    lockSync=false;
	document.location.href = ridaUrl;
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

// TODO: FAIRE instancier le nombre d'objet selon le nombre de panneau ? une boucle sur le nombre de terme du panneaux...
// ajouter un array / d'array() selon la liste en préférence
// fonction dupliquée dans le fichier interface refresh actors....

/*** Récupération de la liste des acteurs de la banque de termes SharePoint ***/
function retrieveActorsList_sync() { // postfix _sync pour dissocier de la même fonction appelée dans call refreshactor.asp
    var context, taxonomySession, termStore, parentTerm, terms, termSet,termsEnumerator, currentTerm;

	context = SP.ClientContext.get_current();
	taxonomySession = SP.Taxonomy.TaxonomySession.getTaxonomySession(context);
    termStore = taxonomySession.get_termStores().getById(taxonomyId);
	actorsTermsList.length = 0; // vider l'array au cas où..., sans déréférencer l'objet.

	if (UseActorsSubSetList ==false) { // ne pas utiliser les sub lists prendre l'ensemble des termes en dessous.
		termSet = termStore.getTermSet(actorsSetId); // on utilise le actorsSetId
		terms = termSet.getAllTerms(); // including chirld
		
		context.load(terms);
		context.executeQueryAsync(Function.createDelegate(this, function (sender, args) {
			// fonction Async qui récupère les termes...
			termsEnumerator = terms.getEnumerator();
			// Récupération des termes (acteurs)
			while (termsEnumerator.moveNext()) {
				currentTerm = termsEnumerator.get_current();
				actorsTermsList.push(currentTerm);
				}
			}), Function.createDelegate(this, function (sender, args) { alert('The error has occured: ' + args.get_message()); }));		
		
	} else {
		
		for (var i in actorsSubSetIdList) { // ne prendre que les sub list défini comme liée au panneau (cf config file)
			termSet = termStore.getTermSet(actorsSubSetIdList[i]);
			terms = parentTerm.getAllTerms();  //load child Terms;
			
			context.load(terms);
			context.executeQueryAsync(Function.createDelegate(this, function (sender, args) {
				termsEnumerator = terms.getEnumerator();
				// Récupération des acteurs
				while (termsEnumerator.moveNext()) {
					currentTerm = termsEnumerator.get_current();
					actorsTermsList.push(currentTerm);
					}
			}), Function.createDelegate(this, function (sender, args) { alert('The error has occured: ' + args.get_message());	}));
		} // for (var i...)
	}// else
	
} // fin retrieveActorsList_sync

/*** Action de synchronisation avec iObeya ***/
// duplication vis à vis du fichier interfacerefresh actors.

/*function syncActors_sync(iObeyaNodes){ // postfix _sync pour dissocier de la même fonction appelée dans call refreshactor.asp
	
	try {
	
		// 1) Récupération des étiquettes du bloc "Ressources"
		//actorsSubSetId
		// TODO: boucle par panneau !!!!
		
		var resourceRoll = findRollbyLabelName(iObeyaNodes, RESOURCES_ZONE,null); // TODO: prendre la valeur de la boucle
		var labelList = findActorsInRectangle(resourceRoll.x, resourceRoll.y, resourceRoll.x + resourceRoll.width, resourceRoll.y + resourceRoll.height, iObeyaNodes);

		// 2) Liste des nouvelles étiquettes à placer
		var labelsToCreate = [];
		var rollObject = findRollbyLabelName(iObeyaNodes, RESOURCES_ZONE,null); // TODO: prendre la valeur de la boucle
		for (var id in actorsTermsList) {
			var actorFound = false;
			for (var j in labelList) {
				if (actorsTermsList[id].get_name() == labelList[j].contentLabel) {
					actorFound = true;
				}
			}
			if (actorFound == false) {
				// Créer le label
				var ridaFormatedObject = getRidaFormatedObject(actorsTermsList[id].get_name());
				var newLabel = createActorLabel(ridaFormatedObject);
				
				// Push le label
	    		iObeyaNodes.push(newLabel);
	    		
	    		// Placer le label
	    		try {
		    		newLabel = placeElement(rollObject, newLabel, RESOURCES_ZONE, iObeyaNodes, Array());

		    		labelsToCreate.push(newLabel);
		    	}
				catch(e) {
					alert(e.message);
					return [];
				}
			}
		}
		
		// Rafraîchissement du rouleau
	    updateiObeyaNode([rollObject]);
	    
		// Commit les labels
		if (labelsToCreate.length > 0) {
		    createiObeyaNode(labelsToCreate, close);
		}
		else {
			close();
		}
	}
	catch (e) {
		// On informe l'utilisateur de la raison de l'erreur
		displayException(e);
	}
	
	function getRidaFormatedObject(actor) {
		var ridaObj = [];
		ridaObj.creationDate = new Date().getTime();
		ridaObj.actor = actor;
		
		return ridaObj;
	}
	
} */