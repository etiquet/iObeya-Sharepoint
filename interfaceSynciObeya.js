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
var todo_cloneiObeya = 8;

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

var g_clientContext; //= new SP.ClientContext(SITEURL);
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
var g_syncID ;
var g_syncErrors = 0;
var g_actorsTermsList = [];

var g_iO_rooms = null;
var g_iO_activeRoom = null;
var g_iO_boards = null;
var g_defaultboard_index = null;  // l'iO_boardsIndex par défaut est calculé lors du processing initial de la liste des boards.

var iO_clientId = null;
var iO_cookie = null;
var iO_nodes = []; // l'array iObeya
var stackNotes = [];

var sp_originurl  ; // origine sharepoint
/**
 * Synchronisation
 */

/*** Initialisation de synchronisation avec iObeya ***/
function startSync(syncID) { // fonction appelée depuis le bouton iObeya
	try {
		if (!syncID) {
			console.log("Pas de jeu de paramètres donné, on prend la valeur par défaut");

			// on recherche la liste selon le titre de la page
			var wname = window.document.title;
			for (entry in SYNC_PROPERTIES_MAP) {
				if (wname.includes(SYNC_PROPERTIES_MAP[entry].LISTSHAREPOINT_TITLE))
					syncID = entry;
			}
			if (!syncID) {
				alert("Le paramètrage de synchronisation iObeya de cette n'est pas configuré,\n veuillez contactez votre administrateur");
				return;
			}
			g_syncID = syncID;
		}

		if (lockSync == true)
			throw new InterfaceException("Une autre instance est déjà en cours, veuillez patienter.\nlockSync==true");

		// Chargement des variables globales
		// TODO what if FAILED ? <<- throw exception. Caught below
		loadSyncConf(syncID);

		// Pour détecter qu'une autre thread est active
        // la valeur false est positionnée après l'affichage du pop-up de fin.
        lockSync=true;
        disableButton();
		refreshTable();     // Rafraîchissement de la vue    

        // Mise à jour de la liste des données RIDA
		ExecuteOrDelayUntilScriptLoaded(function () {
			g_clientContext  = new SP.ClientContext.get_current(); // le contexte ne peut être récupéré que si le script sp.js est loadé.
			//g_clientContext  = new SP.ClientContext(SITEURL); // méthode alternative

			oList = g_clientContext.get_web().get_lists().getByTitle(LISTSHAREPOINT_TITLE);
			retrieveActorsList_sync();
			ridaNodes = retrieveListItems(); //checkIn(syncNotes) en call back
		}, "sp.js");
	}
	catch (e) {
		// TODO: factoriser la gestion des erreurs
		displayException(e);
		// On informe l'utilisateur de la raison de l'erreur
		// Réactivation du bouton
		enableButton();
		lockSync=false;
		window.location.reload() ; // rafraichi la page après l'erreur
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

	    g_syncList = compareforSyncAction(ridaNodes,iObeyaNodes);

	    if (g_syncList == false) {
	    	enableButton();
            lockSync = false;
			window.location.reload() ; // rafraichi la page après l'erreur
	    } else {
			// Synchronisation
			g_syncList = performSyncAction(ridaNodes,iObeyaNodes,g_syncList);

			// Lancement des mises à jours iObeya
			// la suppression se fait en premier
			if (g_nodesToTrash.length > 0)
				createiObeyaNodeInTrash(iObeyaNodes,g_nodesToTrash,null);
			if (g_nodesToUpdate.length > 0)
				updateiObeyaNode(g_nodesToUpdate);
			if (g_nodesToCreate.length > 0)
				createiObeyaNode(g_nodesToCreate,null);
			if (g_syncList.length > 0)
				executeCommit();  // Commit changements Sharepoint
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
function compareforSyncAction(nodesRida, nodesiObeya) {
	var l_synclist = [];
	var iObeyaObject;
	var ridaObject;
	var syncObject;

	try {
		// Parcours RIDA pour comparaison avec l'état actuel de iObeya
		for (var inRida = 0; inRida < nodesRida.length; inRida++) { // boucle éléments du rida
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
					if (ridaObject.idiObeya == null || ridaObject.idiObeya == "") {
						// Cas n°1 : création d'un nouveau post-it dans iObeya
						l_synclist = addSyncObject(l_synclist, todo_createiObeya, ridaObject.idRida, -1, status_todo);
					}
					else {
						// Cas n°2 : désynchronisation de la tâche RIDA
						l_synclist = addSyncObject(l_synclist, todo_removeRida, ridaObject.idRida, -1, status_todo);
					}
				}
			}
			else {
				var noteModificationDate = getNoteLastModificationDate(iObeyaObject, nodesiObeya);

				if (ridaObject.synchroiObeya == true && ridaObject.status != DELETED_STATUS
					&& (ridaObject.modificationDate == null || noteModificationDate == null || (Math.abs(ridaObject.modificationDate - noteModificationDate) > TOLERANCEINTERVAL))
				) {
					if (ridaObject.modificationDate > noteModificationDate) {
						// Cas n°3 : mise à jour iObeya
						l_synclist = addSyncObject(l_synclist, todo_synciObeya, ridaObject.idRida, iObeyaObject.id, status_todo);
					}
					else {
						// Cas n°4 : mise à jour RIDA
						l_synclist = addSyncObject(l_synclist, todo_syncRida, ridaObject.idRida, iObeyaObject.id, status_todo);
						if (needEscallation(iObeyaObject, nodesiObeya)) {
							l_synclist = addSyncObject(l_synclist, todo_cloneiObeya, -1, iObeyaObject.id, status_todo);
						}
					}
				}
				else if (ridaObject.status == DELETED_STATUS || ridaObject.synchroiObeya == false) {
					// Cas n°5 : passage du post-it en corbeille
					l_synclist = addSyncObject(l_synclist, todo_removeiObeya, ridaObject.idRida, iObeyaObject.id, status_todo);
				}
			}
		}

		/*
		 Parcours de l'array iObeya en mémoire
		 Traitement des éléments iObeya qui diffèrent
		 2 cas sont seulements traités :
		 - création d'une entrée RIDAv
		 - déplacement d'une note dans un autre tableau ( possibilité nouvelle en multipanneau )
		 - le cas ou on bouge un post-it sur les panneaux (ex: via la création / suppresssion ou bien via la zone d'échange ) est traité naturellement.
		 */
		for (var iniObeya = 0; iniObeya < nodesiObeya.length; iniObeya++) {
			iObeyaObject = nodesiObeya[iniObeya];

			if (iObeyaObject['@class'] === "com.iobeya.dto.BoardNoteDTO") {
				syncObject = null;
				ridaObject = getRidaObjectByiObeyaId(nodesRida, iObeyaObject.id);

				// Cas n°7 : création de tâche dans RIDA
				if (ridaObject == null) {
					l_synclist = addSyncObject(l_synclist, todo_createRida, -1, iObeyaObject.id, status_todo);
				} else {
					// Cas n°9 : déplacement de panneau
					if (ridaObject.PanneauiObeya.toLowerCase() != iObeyaObject.boardname.toLowerCase()) {
						var found = false;

						for (var loop in l_synclist) {
							// on regarde si l'idiObeya n'est pas déjà dans la synclist (cela devrait être le cas...)
							if (l_synclist[loop].idRida == ridaObject.idRida) {
								// oui, on le flag juste pour deplacement de panneau
								l_synclist[loop].action = todo_moveBoardiObeya;
								found = true;
								console.log("Déplacement de panneau trouvé : on change l'action de synchro");
							}
						}
						// L'objet n'a pas été trouvé dans la liste, on l'ajoute pour supression supprime (ce code ne devrait jamais être activé...)
						if (!found) {
							// On crée un nouvel objet dans la liste
							l_synclist = addSyncObject(l_synclist, todo_moveBoardiObeya, ridaObject.idRida, iObeyaObject.id, status_todo);
							console.log("Etrange : l'objet iObeyaObject n'a pas été trouvé dans l_synclist, ajout d'une entrée");
						}
					} // if ( ridaObject.PanneauiObeya.toLowerCase() != iObeyaObject.boardname.toLowerCase() )
				} // else if (ridaObject == null)
			} // c'est une note if (iObeyaObject['@class'] === "com.iobeya.dto.BoardNoteDTO")
		} // loop array d'objets iObeya

		// Message de confirmation
		var stats = getStats(l_synclist);

		var statsMessage = "- Sens Rida > iObeya : \n\n"
			+ stats[todo_createiObeya] + " Note(s) à créer\n"
			+ stats[todo_synciObeya] + " Note(s) à synchroniser\n"
			+ stats[todo_removeiObeya] + " Note(s) à placer à la corbeille\n"
			+ stats[todo_moveBoardiObeya] + " Note(s) à changer de panneau\n\n"
			+ "- Sens iObeya > Rida : \n\n"
			+ stats[todo_createRida] + " Tâche(s) à créer\n"
			+ stats[todo_syncRida] + " Tâche(s) à synchroniser\n"
			+ stats[todo_removeRida] + " Tâche(s) à désactiver\n"
			+ stats[todo_cloneiObeya] + " Tâche(s) à cloner\n";

		if (l_synclist.length) {
			if (confirm( "Vous avez demandé une synchronisation entre la liste Sharepoint courante et les panneaux iObeya suivants :  \n\n"
					+ BOARDSTOSYNC
					+ ".\n\n"
					+ statsMessage
					+ " \n\nSouhaitez-vous continuer ?\n\n"
					+ "(Liste de paramètres utilisée : "
					+ g_syncID
					+ ")" )) {
				if (!verifieActorsList_sync()) // si la liste n'a pas été chargée à ce moment là c'est un pb
					return false; // on sort
				else return l_synclist;
			} else
				return false;
		} else {
			alert("\n\n *** IL N'Y A PAS D'ELEMENT A SYNCHRONISER ***  \n\n ");
			return false;
		}

	} // try 
	catch (e) {
		throw e;
	}
}


/*** Routage des différents modes de synchronisation possibles ***/
//TODO: evaluer l'opportunité de placer des fonctions qui font une "post-synchro" des objects à l'issus de la première passe de synchro. cf plus bas (ex: si retraitement pendant la synchro)
// cf if( iObeyaObject.toreupdate != undefined ){ empty code.
// idem pour le nom des tableaux RIDA ?

function performSyncAction(nodesRida, nodesiObeya, l_syncList) {
	g_allThreads = false;
	g_nodesToCreate = [];
	g_nodesToUpdate = [];
	g_nodesToTrash = [];
	g_rollsToRefresh = [];

	for (var idSync in l_syncList) {
		var syncObject = l_syncList[idSync];

		var clonediObeyaNode = null;
		var iObeyaOverlapping = null;
		var l_uid = null;
		var result = null;
		var iObeyaToRemove = null;
		var iObeyaObject = null;
		var ridaObject = null;

		if (syncObject.idRida != -1) {
			ridaObject = getRidaObjectByRidaId(nodesRida, syncObject.idRida);
		}
		if (syncObject.idiObeya != -1) {
			iObeyaObject = getiObeyaObjectById(nodesiObeya, syncObject.idiObeya);
			iObeyaOverlapping = findOverlappingElements(iObeyaObject, nodesiObeya);
		}

		try {
			switch (syncObject.action) {

				case todo_cloneiObeya: // Mélange entre create{iObeya,Rida}
					//----   /!\ Copie de todo_createRida   ----
					result = createRida(iObeyaObject, nodesiObeya);
					syncObject.status = status_nil;
					if (iObeyaObject.toreupdate != undefined) {
						g_nodesToUpdate.push(iObeyaObject);
					}
					//------------------------------------------
					// Pas de break, on enchaine sur une procédure de création classique
					// L'objet iObeya sera normalement cloné, car syncObject.idiObeya != null
					// donc iObeyaObject != null

				case todo_createiObeya :
					// on calcule l'UI de la nouvelle ressource
					l_uid = 'rida_' + Math.round(new Date().getTime()) +
						'.' + Math.floor(Math.random() * 1000000);
					result = createNoteIniObeya(nodesRida, nodesiObeya, ridaObject, l_uid, iObeyaObject);
					g_nodesToCreate = g_nodesToCreate.concat(result);
					syncObject.status = updateSyncStatus(result);
					break;

				case todo_synciObeya :
					result = updateNoteIniObeya(nodesRida, nodesiObeya, ridaObject, iObeyaObject, iObeyaOverlapping);
					g_nodesToUpdate = g_nodesToUpdate.concat(result);
					syncObject.status = updateSyncStatus(result);
					break;

				case todo_createRida : // /!\ Copié dans "todo_cloneiObeya"
					result = createRida(iObeyaObject, nodesiObeya);
					syncObject.status = status_nil;
					//syncObject.status = updateSyncStatus(result); // todo: Q: pourquoi pas de gestion du code result ?

					// forcer la mise à jour de la note iObeya si retraitement des données charges (ajoute + "/jh xxx" au contenu)
					// a factoriser avec celui de create rida...
					if (iObeyaObject.toreupdate != undefined) {
						// TODO: écrire la fonction qui update la note iObeya depuis un objet en mémoire
						g_nodesToUpdate.push(iObeyaObject);
					}
					break;

				case todo_syncRida :
					result = updateRida(syncObject.idRida, iObeyaObject, nodesiObeya);
					syncObject.status = updateSyncStatus(result);

					// forcer la mise à jour de la note iObeya si retraitement des données charges (ajoute + "/jh xxx" au contenu)
					// a factoriser avec celui de create rida...
					if (iObeyaObject.toreupdate != undefined) {
						// TODO: écrire la fonction qui update la note iObeya depuis un objet en mémoire
						g_nodesToUpdate.push(iObeyaObject);
					}
					break;

				case todo_removeiObeya :
					iObeyaToRemove = [];
					iObeyaToRemove.push(iObeyaObject);
					if (iObeyaOverlapping != null)
						iObeyaToRemove = iObeyaToRemove.concat(iObeyaOverlapping);
					result = ArrayToRemoveIniObeya(iObeyaToRemove, syncObject.idRida);
					g_nodesToTrash = g_nodesToTrash.concat(result);
					syncObject.status = status_nil;
					break;

				case todo_moveBoardiObeya :
					// on déplace la note de tableau ( effacement / recréation )
					// on détruit (corbeille) la nouvelle note dans le tableau source (maintien de l'ide RIDA)
					iObeyaToRemove = [];
					iObeyaToRemove.push(iObeyaObject);

					// on traite les overlappings objects
					if (iObeyaOverlapping != null)
						iObeyaToRemove = iObeyaToRemove.concat(iObeyaOverlapping);

					result = ArrayToRemoveIniObeya(iObeyaToRemove, syncObject.idRida);
					g_nodesToTrash = g_nodesToTrash.concat(result);

					// on créé maintenant une nouvelle note dans le tableau de destination (nouvel ID de note)
					l_uid = 'rida_' + Math.round(new Date().getTime()) + '.'
							+ Math.floor(Math.random() * 1000000);;
					result = createNoteIniObeya(nodesRida, nodesiObeya, ridaObject, l_uid);
					g_nodesToCreate = g_nodesToCreate.concat(result);
					syncObject.status = updateSyncStatus(result);
					break;

				case todo_removeRida :
					result = leaveSynchroRida(syncObject.idRida);
					syncObject.status = status_nil;
					break;
			}
		} catch (e) {
			syncObject.status = status_failed;
			throw e;
		}

		// Mise à jour du statut de synchronisation
		if (syncObject.status != status_nil) {
			// on met à jour de manière préalable le status sur les erreurs AVANT de lancer la mise à jour d'iObeya
			// lors de la mise à jours via webservice, d'autre checks peuvent être détectés.
			updateRidaStatusSync(syncObject.idRida,
				parseStatus(syncObject.status) // permet de renvoyer un status en texte, et simplifiant les messages pour l'utilisateur
			);
			if (syncObject.status == status_failed) // on incrémente le nombre d'erreurs
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
	myxmlr.open("GET", IOBEYAURL + "/s/j/rooms", true); // TODO: async = no pour un suivi synchrone et debug facilité
	//myxmlr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded; charset=utf-8');  // TODO: paramètre qui permet de lancer une requete CORS sans pre-request ( requete "standart" )
	myxmlr.setRequestHeader('Content-type', 'application/json'); // declanche un prefetch CORS
	myxmlr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
	myxmlr.withCredentials = true;

	myxmlr.onerror = function (e) {
		displayException(new InterfaceException(
			"Une erreur est survenue pendant l'appel de l'url : " + IOBEYAURL + "/s/j/rooms" + "\n Error Status: " + e.target.status
		));
		enableButton();
		lockSync = false;
		window.location.reload(); // rafraichi la page après l'erreur
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
				enableButton();
				lockSync = false;
				window.location.reload(); // rafraichi la page après l'erreur
			}
			getBoards(syncMethod); // on propage la fonction qui sera appelée à la fin...
		}
		catch(e) {
			displayException(e);
			// Réactivation du bouton
			enableButton();
			lockSync = false;
			window.location.reload(); // rafraichi la page après l'erreur
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

var g_boardfound = 0;
var g_countBoardtoload; // pour gérer l'asynchronisme

function getBoards(syncMethod) {
	var myxmlr = null;
	var boardfound = 0;

	console.log("Fetch boards");

	g_iO_boards = new Array();
	iO_nodes = new Array();

// TODO: remettre l'appel getJSONData ( pour permettre un fonctionnement + agnostique de l'environnement ex: navigateur ou GoogleNodejs)
//	myxmlr = getJSONData(IOBEYAURL + "/s/j/rooms/" + g_iO_activeRoom.id + "/details");
	myxmlr = new XMLHttpRequest();
	myxmlr.open("GET", IOBEYAURL + "/s/j/rooms/" + g_iO_activeRoom.id + "/details", true);
	myxmlr.setRequestHeader('Content-type', 'application/json');
	myxmlr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
	myxmlr.withCredentials = true;


	myxmlr.onerror = function (e) {
		displayException(new InterfaceException(
			"Une erreur est survenue pendant l'appel de l'url : " + IOBEYAURL + "/s/j/rooms" + "\n Error Status: " + e.target.status
		));
		// Réactivation du bouton
		enableButton();
		lockSync = false;
		window.location.reload(); // rafraichi la page après l'erreur
	};

	myxmlr.onload = function () {
		try {
			var roomElementsArray = JSON.parse(this.responseText); // la réponse donne la liste des boards

			roomElementsArray.forEach(function (elmnt) {
				if (elmnt["@class"] === "com.iobeya.dto.BoardDTO") { // filtrage par type
					g_countBoardtoload = BOARDSTOSYNC.length; // pour gérer l'attente de fin des threads
					BOARDSTOSYNC.forEach(function (board) {  // on récupère le contenu chaque panneaux
						if (elmnt.name == board) { // on vérifie que le panneau doit être synchronisé
							console.log(" found configured nameBoard: \"" + elmnt.name);
							g_iO_boards.push(elmnt); // on ajoute la board dans l'array
							if (elmnt.name === BOARDSTOSYNC[0]) // on determine quelle l'id de la board par defaut dans l'Array de configuration.
								g_defaultboard_index = g_iO_boards.length - 1;
							g_boardfound++;
							getNodes(elmnt.id, elmnt.name); // attention compliqué car asynchrone, nécessite un timer...
						}
					});
				}
			});
		} catch (e) {
			alert("Erreur lors de la synchronisation Sharepoint/iObeya :\n" + e.message);
			console.log(e.message);
			// Réactivation du bouton
			enableButton();
			lockSync = false;
			window.location.reload(); // rafraichi la page après l'erreur
		}
	};

		myxmlr.send(); // on lance l'appel de la méthode asynchrone.
		// cette function appelle la methode de synchro "syncMethod"
		// quand l'ensemble des threads ont terminé
		waitallboardloaded(syncMethod);
}

//
// fonction qui permet d'attendre que l'ensemble des load on été effectués
// le mode asynchrone oblige a utiliser un timer
// appelle la fonction syncMethod quand terminé

var g_countboardload; // comptage...

function waitallboardloaded(syncMethod) {

	var timerId = window.setInterval(function () {

		console.log("Timer wait load boards: " + g_countboardload++);

		if (!g_countBoardtoload) {  // >0 tant que tous les panneaux n'ont pas été lu...
			console.log(g_boardfound);
			console.log(BOARDSTOSYNC.length)
			console.log(g_defaultboard_index);
			if (g_boardfound != BOARDSTOSYNC.length) {
				throw new InterfaceException("Le nombre de tableaux à synchroniser est différent du nombre de tableaux attendus");
			}

			if (g_defaultboard_index == null) {
				throw new InterfaceException("Aucun tableau n'a été sélectionné");
			}

			if (g_boardfound == 0) { // pas de board trouvé, on arrête.
				throw new InterfaceException("Aucun tableau specifié dans le fichier de configuration n'a été trouvé dans la Room : " + board + ", vérifiez la configuration ");
			}

			// on lance ici la fonctionne de synchro
			clearInterval(timerId);
			console.log("Loaded board complete" + g_boardfound);
			syncMethod(iO_nodes); // on lance la synchro
			// on dépile maintenant la queue des requetes async à lancer à la fin
			nextRequest();
		}

	}, 500); // on check toute les 1/2 secondes
}

/*** Récupération des éléments du tableau ***/

function getNodes(l_boardid, boardname) {
var myxmlr = null;

	console.log('Getting nodes');
	myxmlr= new XMLHttpRequest();
	myxmlr.open("GET",IOBEYAURL + "/s/j/boards/" + l_boardid + "/details",true);
	myxmlr.setRequestHeader('Content-type', 'application/json');
	myxmlr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
	myxmlr.withCredentials = true;

	myxmlr.onerror = function(e) {
		displayException(new InterfaceException(
			"Une erreur est survenue pendant l'appel de l'url : " + IOBEYAURL + "/s/j/boards/"
												+ l_boardid + "/details" + "\n Error Status: " + e.target.status
		));
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

			// sorting nodes with zOrder
			iO_nodes.sort(function(obj1, obj2) {
				return parseInt(obj1.zOrder) - parseInt(obj2.zOrder);
			});

			g_countBoardtoload--; // pour gérer l'asynchronisme

		} catch(e) {
			alert("Erreur lors de la synchronisation Sharepoint/iObeya :\n" + e.message);
			console.log(e.message);
			// Réactivation du bouton
			enableButton();
        	lockSync=false;
			window.location.reload() ; // rafraichi la page après l'erreur
		}
	};

	myxmlr.send(); // on lance la requete en asynchrone...
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
// TODO: que faire en cas de suppression du sticker lien ?
function createNoteIniObeya(nodesRida, nodesiObeya, ridaObj, uid, clonediObeyaNode) {
	var l_boardid = null;

	try {
		console.log("Création d'un nouveau post-it dans iObeya");
		var roll;
		var escallationSticker = null;
		var iObeyaOverlapping = null;
		if (clonediObeyaNode) {
			iObeyaOverlapping = findOverlappingElements(iObeyaObject, nodesiObeya);
			escallationSticker = getAssociatedEscallationSticker(iObeyaOverlapping);
			//Permet de récupérer le nom du tableau pour l'objet à créer
			l_boardid = ESCALLATION_MAPPING.map[escallationSticker.name].destinationPanel;
			// Zone d'atterrissage
			roll = ESCALLATION_MAPPING.map[escallationSticker.name].dropZone;
		}
		else {
			//Permet de récupérer le nom du tableau pour l'objet à créer
			l_boardid = getBoardidFromRidaObj(ridaObj);
			// Zone d'atterrissage
			roll = findRollbyLabelName(nodesiObeya, ridaObj.status, l_boardid);
		}

		// Initialisation de l'object Notes
		var newNote = {};
		newNote['@class'] = 'com.iobeya.dto.BoardNoteDTO';
		newNote.id = uid;
		newNote.isAnchored = false;
		newNote.isLocked = false;
		newNote.linkLabel = "";
		// Vide, si pas la note n'est pas clonée
		newNote.linkUrl = getLinkToContainingBoard(clonediObeyaNode) ? clonediObeyaNode : "";
		newNote.name = "";
		newNote.setName = "";
		if (ridaObj.creator != null)
			newNote.creator = ridaObj.creator;
		newNote.creationDate = ridaObj.creationDate;
		newNote.x = 0;
		newNote.y = 0;
		newNote.zOrder = 0;
		newNote.color = NOTE_DEFAULT_COLOR;

		newNote.props = {
			'content' : 	"",
			'title' : 		"", // charge en J/H
			'responsible' : "", // due date
			'date' : 		"", // target date
			'workload' :  	"" // undisplayed label "workload".
		};

		// Place le contenu "coeur de la note" : les 4 champs visibles
		// note : la fonction pourraient évoluer vers d'autre nature de note
		newNote = fillNoteForiObeya(newNote, nodesRida, nodesiObeya, ridaObj);

		// Initialisation du container  ( la note est rattachée au "containeur" du board )
		/*newNote.container = {
		 // note ce n'est pas l'element container du board mais le elementContainer qu'il faut prendre
		 '@class': 'com.iobeya.dto.EntityReferenceDTO',
		 'id': elementContainer id du board,
		 'type': 'com.iobeya.dto.BoardDTO'
		 };*/
		newNote.container = getBoardElementContainerFromRidaObj(ridaObj);

		// l'id de la board (pas celui du container )
		newNote.boardid = l_boardid; // cette propriété n'est pas standard dans iObeya mais nous l'utilisons pour la logique
		newNote.boardname = getBoardNameFromRidaObj(ridaObj); // cette propriété n'est pas standard dans iObeya mais nous l'utilisons pour la logique

		// new properties for interface v3.3
		// note: properties "props" is setted in fillNoteForiObeya
		newNote.score = -1;
		newNote.scoreRatio = -1;
		newNote.asset = null;
		newNote.fontFamily = "arial";

		// Récupérer tous les éléments qui chevauchent le post-it
		// on créer les autres éléments dont on a besoin ( jusqu'a 3 éléments )
		var overlappingElements = findOverlappingElements(newNote, nodesiObeya); // retourne le besoin d'éléments superposés
		try {
			newNote = placeElement(roll, newNote, ridaObj.status, nodesiObeya, overlappingElements);
		} catch (e) {
			alert(e.message);
			return [];
		}

		// Etiquette du responsable
		var newLabel = null;
		if (ridaObj.actor && ridaObj.actor.hasOwnProperty(length)) { // check au cas où...
			newLabel = createActorLabel(ridaObj);
			newLabel = placeLabel(newLabel, newNote);
			nodesiObeya.push(newLabel);
		}

		// Sticker pourcentage achevé
		var newPercentage = null;
		if (ridaObj.percentComplete != null
				&& PERCENTAGE_IOBEYASTICKER_MAPPING.map[ridaObj.percentComplete] != null ) {
			newPercentage = createSticker(ridaObj, ridaObj.percentComplete, PERCENTAGE_IOBEYASTICKER_MAPPING);
			newPercentage = placePercentCompleteSticker(newPercentage, newNote);
			nodesiObeya.push(newPercentage);
		}

		// Sticker priorité
		var newPriority = null;
		if (ridaObj.priority != null
				&& PRIORITY_IOBEYASTICKER_MAPPING.map[ridaObj.priority] != null ) {
			newPriority = createSticker(ridaObj, ridaObj.priority, PRIORITY_IOBEYASTICKER_MAPPING);
			newPriority = placePrioritySticker(newPriority, newNote);
			nodesiObeya.push(newPriority);
		}

		// Sticker Escallation/Cloned
		var newEscallation = null;
		if (clonediObeyaNode
				&& escallationSticker.hasOwnProperty('name')
				&& ESCALLATION_MAPPING.map[escallationSticker.name] != undefined ) {
			newEscallation = createSticker(ridaObj, escallationSticker.name, ESCALLATION_MAPPING)
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
		if (newEscallation != null)
			elementsToCreate.push(newEscallation);

		updateRida(ridaObj.idRida, newNote, nodesiObeya); // pourquoi ?

		// Rafraîchissement du rouleau ( correction d'un bug lié au rafraichissement en v3.1 les objets passaient derriere le roll )
		g_rollsToRefresh = g_rollsToRefresh.concat(roll);

		return elementsToCreate; // retour la liste des éléments à mettre à jour/ créer dans iObeya
	}
	catch (e) {
		throw e;
	}
}

/***
 * Mise à jour d'un post-it dans l'objet iObeya
 **/
function updateNoteIniObeya(nodesRida, nodesiObeya, ridaObj, iObeyaObj, iObeyaOverlapping){
	try {
		console.log("Mise à jour d'un post-it dans iObeya");

		// on récupère le panneau depuis le RIDA (/!\ il peut avoir changé)
		var l_boardid = getBoardidFromRidaObj(ridaObj);

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
		var roll = findRollbyLabelName(nodesiObeya, ridaObj.status, l_boardid);
		var move = false;

		if (ridaObj.status != iObeyaStatusObj.status) {
			// Le status de l'objet a changé
			// Récupérer tous les éléments qui chevauchent le post-it
			try {
				note = placeElement(roll, note, ridaObj.status, nodesiObeya, iObeyaOverlapping);
			} catch (e) {
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
	catch (e) {
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

function fillNoteForiObeya(note, nodesRida, nodesiObeya, ridaObj) {
	// Vérification des informations à récupérer
	if (!ridaObj.hasOwnProperty('modificationDate'))
		throw new InterfaceException("Le champ \"modificationDate\" ne figure pas dans la liste des champs RIDA à synchroniser.");
	if (!ridaObj.hasOwnProperty('creator'))
		throw new InterfaceException("Le champ \"creator\" ne figure pas dans la liste des champs RIDA à synchroniser.");
	if (!ridaObj.hasOwnProperty('modifier'))
		throw new InterfaceException("Le champ \"modifier\" ne figure pas dans la liste des champs RIDA à synchroniser.");

	// on traite les données
	try {
		// Traitement du statut (statut par défaut)
		if (!ridaObj.status) // Si bug: avant:  if(ridaObj.status == null)
			ridaObj.status = DROP_ZONE;

		// Récupération de la date de modification
		var updateDate = ridaObj.modificationDate;
		if (!updateDate)  // Si bug: avant:  if(update == null)
			updateDate = new Date().getTime();

		// Traitement de la couleur
		if (ridaObj.firmDeadline == true)
		// Echéance ferme : post-it rouge
			note.color = NOTE_WARNING_COLOR;
		else if (note.color == NOTE_WARNING_COLOR && ridaObj.firmDeadline == false)
		// Cette tâche n'a plus d'échéance ferme : post-it jaune
			note.color = NOTE_DEFAULT_COLOR;

		// Post-it
		note.height = NOTE_DEFAULT_HEIGHT;
		note.width = NOTE_DEFAULT_WIDTH;

		/* New Method for version 3.3 for iObeya*/
		if (ridaObj.modifier !== null)
			note.modifier = ridaObj.modifier;

		/* New properties for version 3.3 for iObeya*/
		mapRidaToIObeya(ridaObj, note);

		note.modificationDate = updateDate;
		return note;
	}
	catch (e) {
		throw e;
	}
}

/***
 * Convertit un objet RIDA en fragment d'objet iObeya, en fonction du mapping défini globalement
 * (IOBEYANOTE_MAPPING)
 * @param ridaObj : Object objet RIDA
 * @param iObeyaNote : Object iObeya sur lequel sont reportée les propriétés de l'objet RIDA
 */
function mapRidaToIObeya(ridaObj, iObeyaNote) {

	// Parcours de tous les champs du mapping
	for(var key in IOBEYANOTE_MAPPING) {
		// 'mapingItem' = 'content'|'title'|'responsible'|...
		var mappingItem = IOBEYANOTE_MAPPING[key];

		// Vérification de la présence des champs nécessaires
		if (!mappingItem.hasOwnProperty('type')) {
			// throw new InterfaceException("L'objet '"+key+"' de transformation de RIDA vers iObeya ne possède pas de champ \'type\'");
			console.info("L'objet '"+key+"' de transformation de iObeya vers RIDA ne possède pas de champ 'type'. C'est peut-être normal.");
			continue;
		}
		if (!mappingItem.hasOwnProperty('rida_field')) {
			// throw new InterfaceException("L'objet '"+key+"' de transformation de RIDA vers iObeya ne possède pas de champ \'rida_field\'");
			console.info("L'objet '"+key+"' de transformation de iObeya vers RIDA ne possède pas de champ 'rida_field'. C'est peut-être normal.");
			continue;
		}

		// Initialisation à partir du template iObeya
		var type = mappingItem.type;
		var rida_field = mappingItem.rida_field;
		var emptyString = "";
		if (mappingItem.emptyString)
			var emptyString = mappingItem.emptyString;
		var data = "";
		var cntconcat = 0;

		// Si valeur RIDA est définie, on la traite
		if(ridaObj[rida_field] || rida_field.constructor === Array) {
			// En fonction du type de traitement voulu pour le champ de la note
			switch (type) {
				// Mapping simple 1 -> 1
				case 'text':
					data = parseNoteText(ridaObj[rida_field]);
					break;

				// Mapping complexe, * -> 1
				case 'concat':
					if (rida_field.constructor === Array) {
						// Définition de la chaine de séparation des champs
						var concatString = ":";
						if (mappingItem.hasOwnProperty('concatString'))
							concatString = mappingItem.concatString;

						rida_field.forEach(function (value, index) {
							// Cas de valeurs nulles non prises en compte par le test qui précède le switch
							if (ridaObj[value]) {
								data = data.concat(ridaObj[value]).trim(); // TODO ERIC : ajouté trim pour nettoyer les whitespaces
								cntconcat++;
								// On ajoute la chaine de séparation s'il y a un élément qui suit
							} else
								data = data.concat(emptyString); // si le champs est vide on place une valeur par défaut pour éviter que le split foire dans l'autre sens

							if (rida_field[index + 1])
								data = data.concat(concatString);
						});
						// si l'ensemble des colonnes sharepoint sont vides on supprime le texte
						if (!cntconcat)
							data = "";
					} else if (rida_field.constructor === String) { // cas s'il n'y qu'une seule colonne (erreur de config tolérable)
						data = parseNoteText(ridaObj[rida_field]);
					}
					break;

				// Mapping avec constante : 1 -> 1 + 'string'
				case 'numeric':
					data = ridaObj[rida_field].toString().replace(".", ",");
					// Si une string à ajouter a été définie :
					if (mappingItem.hasOwnProperty('unit'))
						data = data.concat(mappingItem.unit);
					break;

				// Mapping de date : 1 -> 1 ; avec formatage en JJ/MM/YYYY
				case 'date':
					data = new Date(ridaObj.dueDate).format(DATE_FORMAT);
					break;
				default:
					break;
			} // end switch
		} // end if(ridaObj[rida_field] || rida_field.constructor === Array)

		// On vient de construire la donnée à mettre dans le champ iObeya
		// Dans l'arbre de l'objet iObeya, on récupère le parent de l'objet à modifier
		// (on a aussi besoin d'un pointeur)
		var iObeyaPartPtr = getiObeyaPropertyObject(iObeyaNote, key);

		if (iObeyaPartPtr) { // on vérifie que la propriété existe
			iObeyaPartPtr[key] = data;
		} else {
			// TODO + FIXME : lors de la création d'une note la propriété peut ne pas exister car par exemple props peux être absent...
			var debug = true;
		}
	}
}

/**
 * Retourne un booléen si l'objet iObeyaObject a besoin d'être cloné/'escallated' ou non.
 * 'Non', si il l'a déjà été ou s'il n'a pas de sticker associé
 * @param iObeyaObject: object iObeya à tester
 * @param nodesiObeya: ensemble des noeuds iObeya
 * @returns {boolean}
 */
function needEscallation(iObeyaObject, nodesiObeya) {
	var escallation = false;
	// Parmis les éléments qui recouvrent la note, ...
	var iObeyaOverlapping = findOverlappingElements(iObeyaObject, nodesiObeya);
	// ... on regarde si on a un sticker d'escalade dessus
	var escallationSticker = getAssociatedEscallationSticker(iObeyaOverlapping);
	if(escallationSticker) {
		// Si c'est le cas, on cherche la note liée, si elle existe
		for(var node in nodesiObeya) {
			if ( node.hasOwnProperty('linkUrl') && node.linkLabel ) {
				return false;
			}
		}
	}
	// Si on n'a pas trouvé de note avec le bon lien associé, il faut cloner
	return true;
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
		if (ridaObj.actor.hasOwnProperty(length)) { // on vérifie au cas où...
			label.contentLabel = ridaObj.actor;
		}
	} catch (e) {
		label.contentLabel = "/!\\Content type";
		console.log("FillActorLabel: contenttype not text");
	}
	try {
		if (ridaObj.modifier != null)
			label.modifier = ridaObj.modifier;
		if (ridaObj.modificationDate != null)
			label.modificationDate = ridaObj.modificationDate;

		return label;
	}
	catch (e) {
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

function addSyncObject(synclist, action, idRida, idiObeya, status) {

	var syncObject = {};
	syncObject.action = action;
	syncObject.idRida = idRida;
	syncObject.idiObeya = idiObeya;
	syncObject.status = status ;

	synclist.push(syncObject);
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

function getBoardidFromName(name){

     if (name != null)
			for (i in g_iO_boards) { // on scanne la liste globale de node board
				if ( g_iO_boards[i].name.toLowerCase() == name.toLowerCase())
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

function getLinkToContainingBoard(iObeyaObject, nodesiObeya) {
	// Parmis les éléments qui recouvrent la note, ...
	var iObeyaOverlapping = findOverlappingElements(iObeyaObject, nodesiObeya);
	// On trouve le sticker d'escalade qui est dessus
	var escallationSticker = getAssociatedEscallationSticker(iObeyaOverlapping);
	// On récupère la couleur du sticker d'escallation
	var color = escallationSticker.name;
	return IOBEYAURL + ESCALLATION_MAPPING.map[color].boardUrl + iObeyaObject.boardname
}

/***
 * A partir de 'propertyName', qui est une clé de la structure 'IOBEYANOTE_MAPPING',
 * retourne un pointeur sur la partie de l'objet 'iObeyaObj' qui contient cette clé
 * afin que celle-ci puisse être modifiée.
 * Algo: Cette fonction parcourt iObeyaObj à la recherche de la clé correcte, à partir de
 * l'arborescence définie dans IOBEYANOTE_MAPPING via les clés 'iobeya_parent'.
 *
 * Exemple:
 * > var iObeyaObj = { 'props': {
 * >      'content': 'Comment ne pas mourir de peur',
 * >      'title': 'Vivre, vol.2:cdc'
 * > } };
 * > var r = getiObeyaPropertyObject(iObeyaObj, 'title');
 * "r" vaut "iObeya['props']"
 *
 * @param iObeyaObj Object: objet iObeya complet
 * @param propertyName String: nom d'une propriété iObeya, qui est aussi une clé sur le mapping IOBEYANOTE_MAPPING
 * @returns iObeyaProperty Object: Pointeur vers le sous-ensemble de l'objet iObeya qui contient la propriété 'propertyName'
 */
function getiObeyaPropertyObject(iObeyaObj, propertyName) {
	var iObeyaProperty = iObeyaObj;
	// Stocke le chemin remonté dans le mapping depuis 'propertyName'
	var chain = [];
	// Noeud courant
	var node = propertyName;

	try{
		// On construit le chemin qui mène à la racine, tant que node.iobeya_parent est défini
		while(node
		&& IOBEYANOTE_MAPPING.hasOwnProperty(node)
		&& IOBEYANOTE_MAPPING[node].iobeya_parent // équivaut à != ['' | null | undefined ] (au moins)
			) {
			// On remplace le noeud par son parent
			node = IOBEYANOTE_MAPPING[node].iobeya_parent;
			chain.push(node); // Sauvegarde du chemin parcouru
		}
		// On a le chemin, on descend de la racine de l'objet iObeya jusqu'à la feuille
		while(chain.length > 0) {
			iObeyaProperty = iObeyaProperty[chain.pop()];
		}
	} catch (e) {
		var interfaceE = new InterfaceException("Propriété '"+node+"' non trouvée dans l'objet iObeya fourni.");
		interfaceE.parentException = e; // FIXME: non standard
		throw interfaceE;
	}
	return iObeyaProperty;
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
			console.log(g_clientContext); // Contrôle de l'état de la session SharePoint
			g_clientContext.executeQueryAsync(Function.createDelegate(this, this.onUpdateQuerySucceeded), Function.createDelegate(this, this.onQueryFailed));
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
						+ stats[todo_cloneiObeya] 	+ " Tâche(s) clonée(s)\n\n"
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
	stats[todo_cloneiObeya] = 0;

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

	note : interfacerefreshactors.js n'est pas inclus dans les en-têtes des pages,
	ses methodes ne peuvent pas être appellées directement via le bouton iObeya DONC > inclusion de cette fonction ici.

	23 juin 2017 : modification de la façon dont la liste des acteurs est gérés. Il est maintenant possible de gérer les acteurs depuis une autre liste.

***/


function retrieveActorsList_sync() {

	if (window.hasOwnProperty('ACTORLIST_TITLE')) //
		retrieveActorsList_sync_splist();
	else
		retrieveActorsList_sync_taxonomy();

} // fin retrieveActorsList_sync


// function gerant la liste d'acteurs utilisant une liste sharepoint dédiée
var g_collListItem2, g_retrieveactorListStatus; // TODO: @Eric voir pour eviter une variable globale pour syncactors liste, voir si la propriete est passee dans ongetquerysuceed.

function retrieveActorsList_sync_splist() {

	try {
		g_retrieveactorListStatus= "start";
		console.log(g_retrieveactorListStatus);
		//g_collcontxtListItem2 = new SP.ClientContext.get_current(); // new fresh object
		var l_oList = g_clientContext.get_web().get_lists().getByTitle(ACTORLIST_TITLE); // fresh variable from actor liste
		var l_camlQuery = new SP.CamlQuery();
		l_camlQuery.set_viewXml("<View />");
		g_collListItem2 = l_oList.getItems(l_camlQuery);
		g_clientContext.load(g_collListItem2);
		g_clientContext.executeQueryAsync(Function.createDelegate(this, this.onGetQuerySucceededActorslist), Function.createDelegate(this, this.onQueryFailed));
		g_retrieveactorListStatus= "querying";
		console.log(g_retrieveactorListStatus);
	    return ;
	} catch (e) {
		throw new InterfaceException("Les données de la liste d'acteurs \"" + ACTORLIST_TITLE + "\" n'ont pas pu être trouvées dans Sharepoint");
	}
}

// fonction async de complétion la requête sharepoint.

function onGetQuerySucceededActorslist(sender, args) {
	var fields, l_ridaobj, listItemEnumerator, key, actorname, actorID, content = {};
	g_actorsTermsList = []; // vider le tableau d'objet ( on déréférence l'ancienne valeur )
	g_actorsTermsListTable = []; // la liste d'array d'acteurs par panneau

	try {
		console.log("Retrieve Actors sharepoint list items");
		console.log(g_collListItem2);

		// initialise la liste des arrays d'acteurs
		for (var panneau in BOARDSTOSYNC)
			g_actorsTermsListTable[BOARDSTOSYNC[panneau]] = [];
		// on récupère la liste d'acteur
		listItemEnumerator = g_collListItem2.getEnumerator();
		g_retrieveactorListStatus= "parsing";
		console.log(g_retrieveactorListStatus);

		while (listItemEnumerator.moveNext()) {
			fields = listItemEnumerator.get_current().get_fieldValues();
			actorname = formateFieldToExport(fields[ACTORLIST_MATCHINGNAME["actor"]]).trim();
			panneauactor = formateFieldToExport(fields[ACTORLIST_MATCHINGNAME["PanneauiObeya"]]).trim();
			actorID = formateFieldToExport(fields["ID"]);

			if (actorname) {
				var content = {};
				content["actor"] = actorname;
				content["PanneauiObeya"] = panneauactor;
				content["ID"] = actorID;
				g_actorsTermsList.push(content); // on ajouter l'acteur dans la liste
				g_retrieveactorListStatus += ".";
				console.log(g_retrieveactorListStatus);
			}
			if (panneauactor)	// on ajoute l'entrée aux listes dédiées par panneau
				for (var panneau in g_actorsTermsListTable) {
					if (panneauactor.toLocaleLowerCase() === panneau.toLocaleLowerCase()) // s'il n'est pas dans la liste on ne le traite pas
						g_actorsTermsListTable[panneau].push(actorname);
				}
		}// while
	} catch (e) {
		displayException(new InterfaceException(
			"Une erreur est survenue à la lecture de la liste acteurs sharepoint : " + e.message
			+ "possiblement une des propriétés de la liste \"ACTORLIST_MATCHINGNAME\" n'a pas été trouvée."
			+ "\n vérifiez à tout hasard le fichier de configuration interfaceConfig.js ou votre liste sharepoint \n "
		));
		enableButton();// Réactivation du bouton
		lockSync = false;
		window.location.reload(); // rafraichi la page après l'erreur
	}
	g_retrieveactorListStatus = "done";
	console.log(g_retrieveactorListStatus);
}

// function utilisant la taxonomie

function retrieveActorsList_sync_taxonomy() {
	var taxonomySession, termStore, parentTerm, terms, termSet, termsEnumerator, currentTerm;

	l_clientContext = SP.ClientContext.get_current(); // fresh local context
	taxonomySession = SP.Taxonomy.TaxonomySession.getTaxonomySession(l_clientContext);
	termStore = taxonomySession.get_termStores().getById(TAXONOMY_ID);
	g_actorsTermsList = []; // vider le tableau d'objet ( on déréférence l'ancienne valeur )

	/* if (USE_ACTORSSUBSETLIST ==false) { // condition sortie voir plus bas */

	termSet = termStore.getTermSet(ACTORSSET_ID); // on utilise le ACTORSSET_ID
	terms = termSet.getAllTerms(); // including chirld

	l_clientContext.load(terms);

	l_clientContext.executeQueryAsync(Function.createDelegate(this, function (sender, args) {
		// fonction Async qui récupère les termes...
		termsEnumerator = terms.getEnumerator();
		// Récupération des termes (acteurs)
		while (termsEnumerator.moveNext()) {
			currentTerm = termsEnumerator.get_current(); // object sharepoint taxonomie
			g_actorsTermsList.push(currentTerm);
		}
	}), Function.createDelegate(this, function (sender, args) {
		alert('The error has occured: ' + args.get_message());
	}));
}

//TODO : faire un timer car la fonction à besoin de + de temps pour s'executer. ( fct asynchrone... selon query sharepoint)

function verifieActorsList_sync() {
	if (!g_actorsTermsList.length)
			if (confirm( "La liste des acteurs (c'est un pb) récupérée est vide, souhaitez-vous tenter de la recharger ?" )) {
			retrieveActorsList_sync();
			if (!g_actorsTermsList.length) // toujours vide pb...
					if (confirm( "Impossible de recharger la liste, pb de chargement asynchrone, arrêter ?" ))
					return false; // on ne traite pas
		} else
			return false; // on ne traite pas
	return true;
}
