/* global SHAREPOINTLIST_MATCHINGNAME */

/**
 * Opérations CRUD iObeya
 */

// déclarations pour ce fichier

var state_queue_processing = 1;
var state_queue_waiting = 0;
var state_queue_done = 2; // N/A
var oListItem; //global why ?

/*** Création / Mise à jour d'une liste de noeuds sur le board ***/
/*
 *
 * @param {type} iObeyaConnectedPlatform
 * @param {type} iObeyaNodes
 * @returns {Boolean}
 *
 * * TODO: dupliquer la méthode de tri des plateformes dans les autres fonctions
 */

function PostiObeyaNodes(iObeyaConnectedPlatform, iObeyaNodes) {
    var jsonNote, xhttpr = [], iobcptfsentries = [], l_targeturl, found;
    var parentiocptfs = iObeyaConnectedPlatform.parent; // TODO: non utilisé, supprimé ?

    // on crée un array d'entrée avec des #urls
    for (var ii in iObeyaNodes) {

        // on récupère l'url cible de plateforme, par defaut url de la plateforme courante
        l_targeturl = (iObeyaNodes[ii].target_url == undefined || iObeyaNodes[ii].target_url == null) ? iObeyaConnectedPlatform.IOBEYAURL : iObeyaNodes[ii].target_url;
        found = -1;

        for (var iii in iobcptfsentries) { // on scanne la liste existante
            if (l_targeturl === iobcptfsentries[iii].target_url) {
                iobcptfsentries[iii].nodes.push(iObeyaNodes[ii]);// trouvée la plateforme on ajoute l'entrée aux nodes
                found = 1;
                break;
            }
        }

        if (found === -1) {  // on n'a pas trouvé d'entrée == l_targeturl,  on l'ajoute une nouvelle plateforme à l'array
            var newiocptf = {};
            newiocptf.target_url = l_targeturl;
            newiocptf.nodes = [];
            newiocptf.nodes.push(iObeyaNodes[ii]);
            iobcptfsentries.push(newiocptf);
        }
    }

    // lancement des requêtes
    try {
        for (var ptf in iobcptfsentries) {
            jsonNote = JSON.stringify(iobcptfsentries[ptf].nodes);
            console.log("Post (create/update) " + iobcptfsentries[ptf].nodes.length + "nodes à l'url :" + iobcptfsentries[ptf].target_url);
            // note: creation en bulk des éléments
            // pour simplifier la logique générale, on utilise seulement l'arrays de thread de iObeyaConnectedPlatform
            xhttpr[ptf] = postJSONData(iObeyaConnectedPlatform, iobcptfsentries[ptf].target_url + "/s/j/elements", jsonNote); // note : ajoute la requête dans la queue
            xhttpr[ptf].onload = function () {
                if (this.status >= 400) {
                    console.log("erreur sur la requete " + this.responseText);
                }
                nextRequest(iObeyaConnectedPlatform);
            };

            startQueue(iObeyaConnectedPlatform);  // declenche myxmlr.send()
        }
    } catch (e) {
        throw e;
    }
    return true;
}

/*
 *
 * @param {type} iObeyaConnectedPlatform
 * @param {type} iObeyaNodes
 * @returns {Boolean}
 *
 * TODO: NOT USED pour l'instant => si pas utile supprimer
 * TODO: dupliquer la méthode de tri des plateformes
 */
function PutObeyaNodes(iObeyaConnectedPlatform, iObeyaNodes) {
    var jsonNote, myxmlr;

    try {
        jsonNote = JSON.stringify(iObeyaNodes);
        console.log("Put (update) " + iObeyaNodes.length + "nodes à l'url :" + iObeyaConnectedPlatform.IOBEYAURL);
        // note: creation en bulk des éléments

        myxmlr = putJSONData(iObeyaConnectedPlatform, iObeyaConnectedPlatform.IOBEYAURL + "/s/j/elements", jsonNote); // note : ajoute la requête dans la queue

        myxmlr.onload = function () {
            if (this.status >= 400) {
                console.log("erreur sur la requete " + this.responseText);
            }
            nextRequest(iObeyaConnectedPlatform);
        };

        startQueue(iObeyaConnectedPlatform);  // declanche myxmlr.send()
        return true;
    } catch (e) {
        throw e;
    }
}

//*** Suppression d'éléments du board ***/
/*
 *
 * @param {type} iObeyaConnectedPlatform
 * @param {type} idElt
 * @returns {Boolean}
 */
function removeiObeyaElement(iObeyaConnectedPlatform, idElt) {
    var elements, jsonNote, x;

    try {
        elements = [idElt]; // TODO: ne comprend pas cette ligne de code, on passe uniquement l'ID ?
        console.log("Delete node à l'url " + iObeyaConnectedPlatform.IOBEYAURL + "/s/j/elements/" + idElt);
        x = deleteJSONData(iObeyaConnectedPlatform, iObeyaConnectedPlatform.IOBEYAURL + "/s/j/elements/" + idElt, jsonNote);  // ajoute la requête dans la queue
        x.onload = function () {
            if (this.status >= 400) {
                console.log("erreur sur la requete " + this.responseText);
            } else {

            }
            nextRequest(iObeyaConnectedPlatform);
        };
        startQueue(iObeyaConnectedPlatform); //lance le depilage de requetes
        return true;
    } catch (e) {
        throw e;
    }
}

/*** Création d'une liste de noeuds dans la corbeille ***/
//TODO à tester
/*
 *
 * @param {type} iObeyaConnectedPlatform
 * @param {type} iObeyaObjid
 * @returns {undefined|Boolean}
 *
 */
function createiObeyaNodeInTrash(iObeyaConnectedPlatform, iObeyaNodesToTrash) {
    var xhttpr = [], i, elements, jsonNote = []; // tableau d'object Jscript

    try {
        var iObeyaNodes = iObeyaConnectedPlatform.iObeyaNodes;
        if (iObeyaNodesToTrash.length === 0) // pas d'élément à mettre à la corbeille
            return;

        console.log("Corbeille :");
        console.log(iObeyaNodesToTrash);

        elements = createBoardSharedElements(iObeyaNodesToTrash); // on créé des objets partagés pour les placer à la poubelle
        //for ( var ii in elements){ // on créer une requête par panneau. ( le serveur iObeya ne peut traiter qu'un à la fois )
        jsonNote = JSON.stringify(elements);
        xhttpr = postJSONData(iObeyaConnectedPlatform, iObeyaConnectedPlatform.IOBEYAURL + "/s/j/boardShared", jsonNote);
        xhttpr.onload = function () {
            if (this.status >= 400) {
                console.log("erreur sur la requete " + this.responseText);
            } else {

            }
            nextRequest(iObeyaConnectedPlatform);
        };
        //}
        startQueue(iObeyaConnectedPlatform); // déclanche les requêtes
        return true;
    } catch (e) {
        throw e;
    }
}

/*
 * Creation d'un array de l'objet BoardSharedElement pour mise en corbeille  (  )
 * @param {type} iObeyaNodes
 * @param {type} iObeyaObjid : l'ID du noeud à mettre à la corbeille
 * @returns {Array} : shared element
 *
 */
function createBoardSharedElements(iObeyaNodesToTrash) {
    var sharedElmtboardlist = [], found;

    for (var i in iObeyaNodesToTrash) {

        found = -1;
        for (var ii in sharedElmtboardlist) {  // on détermine si un board est déja présent dans la liste avec le board de l'élément
            if (sharedElmtboardlist[ii].container.id === iObeyaNodesToTrash[i].boardid) {
                found = ii;
                break;
            }
        }

        if (found === -1) { // si pas trouve on le crée
            var elemt = {};
            elemt['@class'] = "com.iobeya.dto.BoardSharedElementDTO",
                    elemt.container = {};
            elemt.container['@class'] = "com.iobeya.dto.EntityReferenceDTO";
            elemt.container.type = "com.iobeya.dto.BoardDTO";
            elemt.container.id = iObeyaNodesToTrash[i].boardid; // on place le boardid ici. cf developer guide p27.
            elemt.ids = [];
            elemt.kind = "trashBox";
            sharedElmtboardlist.push(elemt);
            found = sharedElmtboardlist.length - 1;
        }

        sharedElmtboardlist[found].ids.push(iObeyaNodesToTrash[i].id); // une liste object IDs
    } // for...

    return sharedElmtboardlist;
}

/*** Commit des changements iObeya ***/
/*
 
 iObeya ne prend en compte les changements demandés qu'après l'appel de cette fonction
 aftercommit est une fonction qui doit être executée après l'appel de cette fonction
 
 idNoteiObeya : permet de garde en "tête" la note qui est modifiée par cet appel. (ex: pour reporter une erreur dans la ligne du RIDA)
 
 cf page 39 Developper guide 3.4 : Commit Changes : When a client makes some changes in the room, changes are not propagated automatically to other clients. He must explicitly inform the server of the changes by calling the MeetingService#commitRoom method.
 
 retour du Webservice : "@class": "com.iobeya.web.JSonResult", "result": "success","messages": []
 
 TODO : traiter les cas d'erreurs. Si ko ou erreur => placer l'information ko dans l'array sharepoint pour remonter KO.
 
 */
/*
 *
 * @param {type} iObeyaConnectedPlatform : le context iObeya
 * @param {type} iObeyaNodes : Les noeuds iObeyas à manipuler
 * @returns {undefined}
 *
 */
function commitiObeyaChanges(iObeyaConnectedPlatform) {
    var xhttpr = []; // tableau d'object Jscript

    try {
        var parent = iObeyaConnectedPlatform.parent;

        for (var prop in parent)
            if (parent[prop] instanceof Array) // un type array
                if (parent[prop].hasOwnProperty("IOBEYAURL")) // qui dispose de la propriété IOBEYAURL
                    if (parent[prop].connected) { // et connecté

                        for (var ii in parent[prop].rooms) { // loops sur l'ensemble des rooms

                            xhttpr[ii] = getJSONData(parent[prop], parent[prop].IOBEYAURL + "/s/j/meeting/commit/" + parent[prop].clientId
                                    + "?roomId=" + parent[prop].rooms[ii].id
                                    + "&boardId=" // si l'on laisse boardid vide toutes les boards de la room sont raffraichies // + iObeyaConnectedPlatform.boards[i].id // TODO : a vérifier.
                                    ); // requête jsonhttp Async, ajouter cette requêt dans la queue.

                            xhttpr[ii].onload = function () { // fonction Asynchrone appelée sur la fin de l'appel http.

                                var jsonResponse = JSON.parse(this.responseText);
                                console.log(jsonResponse);

                                if (jsonResponse.result === "error") {
                                    // TODO: à faire... traiter si la requete n'est pas OK...
                                }
                                nextRequest(iObeyaConnectedPlatform); // on dépile les requêtes... uniquement sur la ptfprincipale =>TODO:bascule les threads sur l'object racine
                            };

                            startQueue(iObeyaConnectedPlatform); // On déclenche la queue d'appel asynchrone pour réaliser le commit

                        }

                    }

    } catch (e) {
        throw e;
    }
}

/*
 * 
 * Object.keys(obj)
 * 
 * for (var prop in obj) {
 * if( obj.hasOwnProperty( prop ) )
 * 
 * 
 if (elmnt instanceof Array && elmnt.hasOwnProperty("IOBEYAURL") ){
 if (elmnt.connected === true) { // et si l'url est initialisée et connectée
 
 var debug = true;
 
 }
 }
 
 */

/*** Déclenchement la sérialisation de la file de requetes vers iObeya***/
/*
 *
 * @param {type} iObeyaConnectedPlatform
 * @returns {undefined}
 */
function startQueue(iObeyaConnectedPlatform) {
    if (iObeyaConnectedPlatform.requestQueue.length > 0) {
        var elt = iObeyaConnectedPlatform.requestQueue[0]; // on prend le 1er élement de la queue.
        if (elt.state === state_queue_waiting) {
            // Le premier élément n'est pas en cours de traîtement, on le lance
            if (elt.payload !== null) {
                elt.xhr.send(elt.payload);
            } else {
                elt.xhr.send();
            }
            iObeyaConnectedPlatform.requestQueue[0].state = state_queue_processing;
        }
    }
}

/*
 * Dépile les requêtes une à une.
 * @param {type} iObeyaConnectedPlatform
 * @returns {undefined}
 */
function nextRequest(iObeyaConnectedPlatform) {
    if (iObeyaConnectedPlatform.requestQueue.length > 0) {
        iObeyaConnectedPlatform.requestQueue.splice(0, 1); // Retrait de la première requête
    }
    startQueue(iObeyaConnectedPlatform); // Requête suivante
}

/*** Création d'un XMLHttpRequest (requête GET) ***/
/* NOTE : pas utilisé pour l'instant
 * 
 * @param {type} iObeyaConnectedPlatform
 * @param {type} url
 * @returns {XMLHttpRequest|getJSONData.l_xmlr}
 */
function getJSONData(iObeyaConnectedPlatform, url) {
    var l_xmlr = null;

    l_xmlr = new XMLHttpRequest();
    l_xmlr.open("GET", url, true); // async = true
    l_xmlr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded; charset=utf-8'); // pour éviter CORS
    // l_xmlr.setRequestHeader('Content-type', 'application/json');
    l_xmlr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    l_xmlr.withCredentials = true;

    // ajout / lancement de la requete
    iObeyaConnectedPlatform.requestQueue.push({"xhr": l_xmlr, "payload": null, "state": state_queue_waiting}); 	// insère dans la Queue pour traintement async
    //x.send(); // pour debug, commenter la ligne au dessus

    return l_xmlr;
}


function deleteJSONData(iObeyaConnectedPlatform, url) {
    var l_xmlr = null;

    l_xmlr = new XMLHttpRequest();
    l_xmlr.open("DELETE", url, true); // async = true
    l_xmlr.setRequestHeader('Content-type', 'application/json');
    l_xmlr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    l_xmlr.withCredentials = true;

    // ajout / lancement de la requete
    iObeyaConnectedPlatform.requestQueue.push({"xhr": l_xmlr, "payload": null, "state": state_queue_waiting}); 	// insère dans la Queue pour traintement async
    //x.send(); // pour debug, commenter la ligne au dessus

    return l_xmlr;
}

/*** Création d'un XMLHttpRequest (requête POST) ***/
/*
 * 
 * @param {type} iObeyaConnectedPlatform
 * @param {type} url
 * @param {type} payload
 * @returns {postJSONData.l_xmlr|XMLHttpRequest}
 */
function postJSONData(iObeyaConnectedPlatform, url, payload) {
    var l_xmlr = null;

    // creation de la requete
    l_xmlr = new XMLHttpRequest();
    l_xmlr.open("POST", url, true);	// async = true
    l_xmlr.setRequestHeader('Content-type', 'application/json');
    l_xmlr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    l_xmlr.withCredentials = true;

    // ajout / lancement de la requete
    iObeyaConnectedPlatform.requestQueue.push({"xhr": l_xmlr, "payload": payload, "state": state_queue_waiting}); 	// insère dans la Queue pour traintement async
    //x.send(payload); // pour debug, commenter la ligne au dessus

    return l_xmlr;
}

/*
 * 
 * @param {type} iObeyaConnectedPlatform
 * @param {type} url
 * @param {type} payload
 * @returns {XMLHttpRequest|putJSONData.l_xmlr}
 */

/*** Création d'un XMLHttpRequest (requête PUT) ***/
function putJSONData(iObeyaConnectedPlatform, url, payload) {
    var l_xmlr = null;

    // creation de la requete
    l_xmlr = new XMLHttpRequest();
    l_xmlr.open("PUT", url, true);	// async = true
    l_xmlr.setRequestHeader('Content-type', 'application/json');
    l_xmlr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    l_xmlr.withCredentials = true;

    // ajout / lancement de la requete
    iObeyaConnectedPlatform.requestQueue.push({"xhr": l_xmlr, "payload": payload, "state": state_queue_waiting}); 	// insère dans la Queue pour traintement async
    //x.send(payload); // pour debug, commenter la ligne au dessus

    return l_xmlr;
}

/**
 * Opérations "CRUD" RIDA
 * ces "helpers" créent des objets Sharepoints qui seront ensuites exécuter
 * TODO: déplacer ces functions de ce fichier pour séparer les CRUDs sharepoints
 * Cette fonction prépare une requête CAML sharepoint qui doit ensuite être exécutée via un executeQueryAsync( 
 *  située dans la fonction interfaceSynciObeya.js/performSyncCRUDs
 *
 *  cf. https://msdn.microsoft.com/en-us/library/office/hh185011(v=office.14).aspx
 */
function CAMLUpdateSyncLogList(iObeyaConnectedPlatform) {  // On construit la requete pour faire la mise à jour de liste sharepoint logsyncActions

    if (iObeyaConnectedPlatform.synclist.length === 0 || this.LISTLOG_TITLE == undefined)
        return;

    var clientContext = iObeyaConnectedPlatform.clientContext;
    var oList = clientContext.get_web().get_lists().getByTitle(LISTLOG_TITLE);

    for (var ii in iObeyaConnectedPlatform.synclist) {

        // TODO: filtrer ici les évènements selon le niveau de log demandé
        //
        var itemCreateInfo = new SP.ListItemCreationInformation();
        var oListItem = oList.addItem(itemCreateInfo);

        if (syncType.properties[iObeyaConnectedPlatform.synclist[ii].action].name != null)
            oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["syncaction"], syncType.properties[iObeyaConnectedPlatform.synclist[ii].action].name);

        if (iObeyaConnectedPlatform.synclist[ii].datestamp != null)
            oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["datestamp"], new Date(iObeyaConnectedPlatform.synclist[ii].datestamp));

        if (iObeyaConnectedPlatform.synclist[ii].linkUrl != null)
            oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["linkUrl"], iObeyaConnectedPlatform.synclist[ii].linkUrl);

        if (iObeyaConnectedPlatform.synclist[ii].datecreation != null)
            oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["datecreation"], new Date(iObeyaConnectedPlatform.synclist[ii].datecreation));

        if (iObeyaConnectedPlatform.synclist[ii].PanneauiObeya != null)
            oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["PanneauiObeya"], iObeyaConnectedPlatform.synclist[ii].PanneauiObeya);

        if (iObeyaConnectedPlatform.synclist[ii].status != null)
            oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["status"], iObeyaConnectedPlatform.synclist[ii].status);

        if (iObeyaConnectedPlatform.synclist[ii].subject != null)
            oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["subject"], iObeyaConnectedPlatform.synclist[ii].subject);

        // On convertit
        var dueDate = iObeyaConnectedPlatform.synclist[ii].dueDate;
        if (typeof dueDate !== 'number' && dueDate != null)
            dueDate = new Date(reverseDate(dueDate));

        if (dueDate != null)
            oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["dueDate"], new Date(dueDate));

        if (iObeyaConnectedPlatform.synclist[ii].firmDeadline != null)
            oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["firmDeadline"], iObeyaConnectedPlatform.synclist[ii].firmDeadline);

        if (iObeyaConnectedPlatform.synclist[ii].chantier != null)
            oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["chantier"], iObeyaConnectedPlatform.synclist[ii].chantier);

        if (iObeyaConnectedPlatform.synclist[ii].resteafaire != null)
            oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["resteafaire"], iObeyaConnectedPlatform.synclist[ii].resteafaire);

        if (iObeyaConnectedPlatform.synclist[ii].priority != null)
            oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["priority"], iObeyaConnectedPlatform.synclist[ii].priority);

        if (iObeyaConnectedPlatform.synclist[ii].projet != null)
            oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["projet"], iObeyaConnectedPlatform.synclist[ii].projet);

        if (iObeyaConnectedPlatform.synclist[ii].idRida != null)
            oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["idrida"], iObeyaConnectedPlatform.synclist[ii].idRida);

        if (iObeyaConnectedPlatform.synclist[ii].idiObeya != null)
            oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["idiObeya"], iObeyaConnectedPlatform.synclist[ii].idiObeya);

        oListItem.update();

        clientContext.load(oListItem);

        clientContext.executeQueryAsync(Function.createDelegate(this, this.onQuerySucceeded(oListItem)), Function.createDelegate(this, this.onQueryFailed));

    }
}

/*** Création d'une donnée RIDA ***/

/*
 * 
 * @param {type} clientContext : Shareppont 
 * @param {type} iObeyaNote
 * @param {type} iObeyaNodes
 * @returns {Boolean}
 */

function createCAMLCreateRidaEntry(iObeyaConnectedPlatform, iObeyaNote) {
    var error = 0;

    try {

        var itemCreateInfo = new SP.ListItemCreationInformation();
        var oListItem = g_oList.addItem(itemCreateInfo);

        // Récupérer les objets qui chevauchent la note / ou la card
        var iObeyaOverlapping = findOverlappingElements(iObeyaNote, iObeyaConnectedPlatform.iObeyaNodes);
        var iObeyaLabel = getAssociatedLabel(iObeyaOverlapping);
        var iObeyaPercentCompleteSticker = getAssociatedPercentCompleteSticker(iObeyaOverlapping);
        var iObeyaPrioritySticker = getAssociatedPrioritySticker(iObeyaOverlapping);

        // Extraire les champs de l'objet note puis des étiquettes et stickers associés à des données RIDA
        error = getNoteProperties(oListItem, iObeyaNote, iObeyaConnectedPlatform.iObeyaNodes);
        error = +getLabelProperties(oListItem, iObeyaLabel);
        error = +getPercentCompleteStickerProperties(oListItem, iObeyaPercentCompleteSticker);
        error = +getPriorityStickerProperties(oListItem, iObeyaPrioritySticker);

        // Date de création / modification
        //TODO: test on place la même date dans les 2 champs

        var newdate = new Date(getNoteLastModificationDate(iObeyaNote, iObeyaConnectedPlatform.iObeyaNodes));
        var modifdate = new Date(getNoteLastModificationDate(iObeyaNote, iObeyaConnectedPlatform.iObeyaNodes));

        oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["creationDate"], modifdate);
        oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["modificationDate"], modifdate); 

        // Synchronisé avec iObeya : Oui
        oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["synchroStatus"], synchro_status_done);
        //Nom du tableau sur lequel est la note
        oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["PanneauiObeya"], iObeyaNote.boardname);

        oListItem.update();
        iObeyaConnectedPlatform.clientContext.load(oListItem); // prépartion de la requête, nécessite un appel à executeQueryAsync(...) pour être exécuté

        // note : si l'une des note doit mettre à jour des prédécesseurs, il faut mener l'opération en 2 temps ( creation, puis optention des id et mise à jour )       
        var hasprecedessor = noteHasPredecessor(iObeyaConnectedPlatform.ridaNodes, oListItem, iObeyaNote);
        
        if (hasprecedessor){
                iObeyaConnectedPlatform.sharepointToReupdate = true; // indique qu'il faudra faire une mise à jour de sharepoint
                iObeyaNote.sharepointToReupdate = true; // indique qu'il faudra faire une mise à jour de sharepoint avec cette note pour la 2 ème passe
            }
        // TODO : Positionner un flag et créer un array dédié ? pour indiquer qu'il faut faire 2 passes 1/ pour créer, ensuite 2/ pour faire l'update sur le prédecessor    

        console.log("Create RIDA CAML query" + iObeyaNote.id + " errors count :" + error + " date création : " + modifdate + " date modif :" + modifdate);

    } catch (e) {
        throw e;
    }

    return error;
}

function onQuerySucceeded_test() {

    alert('Item created:');
}

function onQueryFailed_test(sender, args) {

    alert('Request failed. ' + args.get_message() + '\n' + args.get_stackTrace());
    ErrorLogingReloadPage("Erreur pendant execution du script"); // on se sert de cette fonction pour sortir et rafraichir la page

}


/*** Mise à jour d'une donnée RIDA ***/
/*
 *  Cette fonction prépare une requête CAML d'update sharepoint qui doit ensuite être exécutée via un executeQueryAsync( 
 *  située dans la fonction interfaceSynciObeya.js/performSyncCRUDs
 * 
 * @param {type} clientContext
 * @param {type} ridaId
 * @param {type} iObeyaNote
 * @param {type} iObeyaNodes
 * @returns {Boolean}
 */

function createCAMLupdateRidaEntry(iObeyaConnectedPlatform, ridaId, iObeyaNote, ok_text) {
    var error = 0;
    
    try {
        var l_oList = iObeyaConnectedPlatform.oList;
        var oListItem = l_oList.getItemById(ridaId);

        // Récupérer les objets qui chevauchent le post-it
        var iObeyaOverlapping = findOverlappingElements(iObeyaNote, iObeyaConnectedPlatform.iObeyaNodes);
        var iObeyaLabel = getAssociatedLabel(iObeyaOverlapping);
        var iObeyaPercentCompleteSticker = getAssociatedPercentCompleteSticker(iObeyaOverlapping);
        var iObeyaPrioritySticker = getAssociatedPrioritySticker(iObeyaOverlapping);

        // Extraire les champs de l'objet note puis des étiquettes et stickers associés à des données RIDA
        error = getNoteProperties(oListItem, iObeyaNote, iObeyaConnectedPlatform.iObeyaNodes);
        error = +getLabelProperties(oListItem, iObeyaLabel);
        error = +getPercentCompleteStickerProperties(oListItem, iObeyaPercentCompleteSticker);
        error = +getPriorityStickerProperties(oListItem, iObeyaPrioritySticker);
        var hasprecedessor = getNotePredecessor(iObeyaConnectedPlatform.ridaNodes, oListItem, iObeyaNote); // on ne place pas le prédécesseur car il faut avoir l'id des items en mémoire pour travailler

        // Date de modification
        var modifdate =getNoteLastModificationDate(iObeyaNote, iObeyaConnectedPlatform.iObeyaNodes);
        var modifdate_str =  new Date(modifdate);

       oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["modificationDate"], modifdate_str);
        
        //Mise à jour du tableau
        oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["PanneauiObeya"], iObeyaNote.boardname);

        if (ok_text.length <= 0)
            ok_text = "ok";

        if (error > 0) {
            error = error + 'errs';
            oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["synchroStatus"], error);
        } else
            oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["synchroStatus"], ok_text);

        oListItem.update();

        console.log("Create CAML query : Update RIDA sur l'id iObeya :" + iObeyaNote.id +" /"+ iObeyaNote.props.content + " Errors count :" + error + " Modif date :" + modifdate +" /"+modifdate_str );
        
    } catch (e) {
        throw e;
    }

    return error;
}

/*** Mise à jour du statut de synchronisation d'une donnée RIDA ***/
/* Cette fonction prépare une requête CAML sharepoint qui doit ensuite être exécutée via un executeQueryAsync( 
 *  située dans la fonction interfaceSynciObeya.js/performSyncCRUDs
 
 * @param {type} iObeyaConnectedPlatform
 * @param {type} ridaId
 * @param {type} status
 * @returns {Boolean}  */

function CAML_updateRidaSyncInfo(iObeyaConnectedPlatform, ridaId, status) {
    try {
        var oListItem = iObeyaConnectedPlatform.oList.getItemById(ridaId);
        oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["synchroStatus"], status);
        oListItem.update();
        return true;
    } catch (e) {
        throw e;
    }
}

/*** Désactive la synchronisation d'une donnée RIDA ***/
/*
 *  Cette fonction prépare une requête CAML sharepoint qui doit ensuite être exécutée via un executeQueryAsync( 
 *  située dans la fonction interfaceSynciObeya.js/performSyncCRUDs
 *  
 * @param {type} clientContext
 * @param {type} ridaId
 * @returns {Boolean}
 */

function CAML_DeactivateRidaEntrySynchroFlag(iObeyaConnectedPlatform, ridaId) {
    try {
        console.log("Clear  synchro information from the RIDA element" + ridaId);
        var oListItem = iObeyaConnectedPlatform.oList.getItemById(ridaId);
        oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["synchroiObeya"], false);
        oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["idiObeya"], null);
        oListItem.update();
        return true;
    } catch (e) {
        throw e;
    }
}


/*
 * Cette fonction récupère le prédécessor d'une note pour créer une dépendance de tâche dans le sharepoint 
 * Nécessite d'avoir les it Sharepoint en mémoire
 * @param {type} nodesRida
 * @param {type} oListItem
 * @param {type} iObeyaNote
 * @returns {Boolean}
 */

function getNotePredecessor(nodesRida, oListItem, iObeyaNote) {
    var statusObject;
    var haspredecessor = false;
    try {
        if (iObeyaNote.hasOwnProperty("overlappingNotesChain")) {

            // on loop dans l'array pour trouver le prédécesseur
            var l_precedessor;

            for (var ii = 0; ii < iObeyaNote.overlappingNotesChain.length; ii++) { // on loop dans l'array

                if (iObeyaNote.overlappingNotesChain[ii].id === iObeyaNote.id) { // on s'arrête de boucler quand on tombe sur le noeud lui-même
                    if (SHAREPOINTLIST_MATCHINGNAME.hasOwnProperty("predecessors")) {
                        var predecessor = {};
                        var predecessor_array = [];

                        if (l_precedessor != null)
                            if (l_precedessor.hasOwnProperty("id")) {
                                var predecessorId = getRidaObjectByiObeyaId(nodesRida, l_precedessor.id).idRida;
                                var newLookupField = new SP.FieldLookupValue();
                                newLookupField.set_lookupId(predecessorId);
                                if (predecessorId > 0) // a-t-on trouver le prédecesseur dans la mémoire ?
                                    oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["predecessors"], newLookupField);
                                haspredecessor = true;
                            }

                        return haspredecessor; // on sort (on ne gère qu'un prececesseur )
                    }

                } else
                    l_precedessor = iObeyaNote.overlappingNotesChain[ii]; // on boucle
            }
        }
        // pas de precedesseur => on vide la colonne
        oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["predecessors"], null);
        return haspredecessor;

    } catch (e) {
        throw e;
    }
}

/*
 * Cette fonction indique si la note passée va positionner un prédécesseur 
 * Nécessite d'avoir les it Sharepoint en mémoire
 * @param {type} nodesRida
 * @param {type} oListItem
 * @param {type} iObeyaNote
 * @returns {Boolean}
 */

function noteHasPredecessor(nodesRida, oListItem, iObeyaNote) {
    var statusObject;
    var haspredecessor = false;
    try {
        if (iObeyaNote.hasOwnProperty("overlappingNotesChain")) {

            // on loop dans l'array pour trouver le prédécesseur
            var l_precedessor;

            for (var ii = 0; ii < iObeyaNote.overlappingNotesChain.length; ii++) { // on loop dans l'array

                if (iObeyaNote.overlappingNotesChain[ii].id === iObeyaNote.id) { // on s'arrête de boucler quand on tombe sur le noeud lui-même
                    if (SHAREPOINTLIST_MATCHINGNAME.hasOwnProperty("predecessors")) {
                        var predecessor = {};
                        var predecessor_array = [];

                        if (l_precedessor != null)
                            if (l_precedessor.hasOwnProperty("id")) {
                                haspredecessor = true;
                            }

                        return haspredecessor; // 
                    }

                } else
                    l_precedessor = iObeyaNote.overlappingNotesChain[ii]; // on boucle
            }
        }
        // pas de precedesseur => on vide la colonne
        oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["predecessors"], null);
        return haspredecessor;

    } catch (e) {
        throw e;
    }
}




// cette fonction :
// - récupère les données d'un object iObeya en mémoire ( et récupéré depuis la plateforme )
// - met également à jour les données de l'object nodesRida[idInRidaArray] (si non null), associée pour permettre de répliquer des régles associées aux données de charges
// - notamment, cela permet de faire une post mise à jour de la note iObeya dans l'outil si le flag  suivant est positionné >> iObeyaNote.toreupdate = true

/*
 * 
 * @param {type} oListItem
 * @param {type} iObeyaNote
 * @param {type} iObeyaNodes
 * @returns {Number}
 */

function getNoteProperties(oListItem, iObeyaNote, iObeyaNodes) {
    var statusObject;
    var error = 0;

    try { // On traite les données liées à la charge

        // Echéance ferme (la note est en rouge pour la note, pour la card c'est une propriété intrasèque)

        if (iObeyaNote['@class'] === "com.iobeya.dto.BoardNoteDTO")  // pour la note seulement
            if (iObeyaNote.color === NOTE_WARNING_COLOR) {
                oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["firmDeadline"], true);
            } else {
                oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["firmDeadline"], false);
            }

        if (iObeyaNote['@class'] === "com.iobeya.dto.BoardCardDTO") {// pour la card seulement
            /*var priority=false;
             
             iObeyaNote.checklist.hasOwnProperty(iObeyaNote.props)
             iObeyaNote.checklist.hasOwnProperty(iObeyaNote.props.priority)
             priority=iObeyaNote.props.priority;
             
             oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["firmDeadline"], priority);*/

            if (iObeyaNote.checklist instanceof Array) {
                // on tri l'arraus
                var sortcheck = [];
                for (var key in iObeyaNote.checklist)
                    if (iObeyaNote.checklist.hasOwnProperty(key))
                        sortcheck.push(iObeyaNote.checklist[key]);

                sortcheck.sort(function (a, b) {
                    return a.index - b.index; // compare numbers
                });

                var details_text = "<div>\n";

                if (SHAREPOINTLIST_MATCHINGNAME["details"]) {// seulement si la valeur 'details' est déclarée
                    for (var iii in sortcheck) { // on itère sur l'array
                        var chk_lst = sortcheck[iii];
                        if (chk_lst.status) {
                            details_text += '<span style="text-decoration&#58;line-through;">'; //
                            details_text += chk_lst.label;
                            details_text += '</span>';
                        } else
                            details_text += chk_lst.label;
                        details_text += "<br>\n";
                    } // for (var iii in sortcheck){
                    details_text += "</div>";
                    oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["details"], details_text);
                } //if( SHAREPOINTLIST_MATCHINGNAME["details"] )
            }  //if (iObeyaNote.checklist instanceof Array )
        }
        error = mapIObeyaToRida(oListItem, iObeyaNote); // affectation dynamique des champs.

        if (error) { // il y a eu un pb d'interpretation
            // on ajoute /!\ au début de la note pour attirer l'attention
            iObeyaNote.props.content = "/!\\ " + iObeyaNote.props.content;
            iObeyaNote.toreupdate = true; // pour que la note soit rafraichie 
        }

        statusObject = findNoteStatus(iObeyaNote, iObeyaNodes); // Statut
        oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["status"], statusObject.status);

        // ID iObeya
        oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["idiObeya"], iObeyaNote.id);
        // Synchronisé avec iObeya : Oui
        oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME["synchroiObeya"], true);

        return error;
    } catch (e) {
        throw e;
    }
}

/***
 * Met à jour l'objet RIDA en fonction du fragment de l'objet iObeya passé en paramètre.
 * Le fragment iObeya est aussi parfois modifié, en particulier si une erreur est rencontrée.
 * @param iObeyaNote Object I/O Partie de l'objet iObeya, mis à jour dans la fonction
 * @param oListItem Object I/O Objet Sharepoint, mis à jour dans la fonction
 */
function mapIObeyaToRida(oListItem, iObeyaNote) {
    var error = 0;

    for (var key in IOBEYANOTE_MAPPING) {
        var mappingItem = IOBEYANOTE_MAPPING[key];

        // on ne garde que les propriétés liés à l'object iObeya en cours
        if (mappingItem.class !== iObeyaNote['@class'])
            continue;

        // Vérification de la présence des champs nécessaires
        if (!mappingItem.hasOwnProperty('type')) {
            //throw new InterfaceException("L'objet '"+key+"' de transformation de iObeya vers RIDA ne possède pas de champ \'type\'");
            console.info("L'objet '" + key + "' de transformation de iObeya vers RIDA ne possède pas de champ \'type\'. C'est peut-être normal.");
            continue;
        }
        if (!mappingItem.hasOwnProperty('rida_field')) {
            //throw new InterfaceException("L'objet '"+key+"' de transformation de iObeya vers RIDA ne possède pas de champ \'rida_field\'");
            console.info("L'objet '" + key + "' de transformation de iObeya vers RIDA ne possède pas de champ \'rida_field\'. C'est peut-être normal.");
            continue;
        }



        // Initialisation à partir du template iObeya
        // {'title': 'titre dans iobeya'}
        var iObeyaPartPtr = getiObeyaPropertyObject(iObeyaNote, key);
        var data = iObeyaPartPtr[key];

        var type = mappingItem.type;
        var rida_field = mappingItem.rida_field;

        // Si on doit mettre à jour l'objet iObeya (ex. en cas d'erreur)
        var updateIObeya = false;

        if (data != null) {
            // En fonction du type de traitement voulu pour le champ de la note
            switch (type) {
                // Mapping simple, 1 -> 1
                case 'text':
                    // on nettoit les caractères non alphanum
                    data = data.replace(/\t/g, "");
                    data = data.replace(/\n/g, "");
                    data = data.replace(/\r/g, "");
                    data = data.replace(/\f/g, "");

                    if (data.length >= 255) {
                        data = data.substr(0, 254);
                        data = data.concat("…");
                        alert("Le champs text de la note depasse 255 chars, il a été tronqué :\n\n" + iObeyaNote.props.content);
                    }
                    oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME[rida_field], data);
                    break;

                    // Mapping complexe 1 -> n (split du champs source en plusieurs champs )
                case 'concat':

                    if (rida_field instanceof Array) {  // Vérification du type, bien champs à concaténer ?
                        // Définition de la chaine de séparation des champs
                        var concatString = ":"; // Si pas définie, ':' par défaut
                        if (mappingItem.hasOwnProperty('concatString'))
                            concatString = mappingItem.concatString;

                        data = data.split(concatString);

                        rida_field.forEach(function (value, index) {
                            // Protection contre le 'trop de split'
                            if (rida_field[index + 1]) {
                                oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME[value], data.shift().trim());
                            } else {
                                var reConcatenatedData = '';
                                while (data.length > 1) { // Pas jusqu'au dernier élément, il est ajouté en dehors du 'while'
                                    reConcatenatedData += data.shift() + concatString;
                                }
                                reConcatenatedData += data.shift();
                                if (reConcatenatedData == undefined)
                                    alert("data undefined Note : " + iObeyaNote.props.content)
                                oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME[value], reConcatenatedData);
                            }
                        });
                    } else if (rida_field.constructor === String) {
                        oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME[rida_field], data);
                    }
                    break;

                    // Mapping 1 + 'string' -> 1
                case 'numeric':
                    // On récupère le marqueur (ex. ' J/H (RAF)')
                    var unit = '';
                    if (mappingItem.hasOwnProperty('unit'))
                        unit = mappingItem.unit;

                    if (data.length > 0) {
                        var numbers = filterNumbers(data);
                        if (numbers !== null) { // OK, car data initalisé à '' et filterNumbers('') = null
                            // on place la valeur dans le RIDA
                            oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME[rida_field], numbers);
                            // on met à jour l'objet iObeya en mémoire avec le texte au bout
                            data = numbers + unit;
                        } else {
                            // Choisir : log | changement de val. iObeya | alert
                            data = "/!\\ " + data; // Ajout de /!\ au champ pour alerter de l'erreur
                            error++;
                        }
                        updateIObeya = true;
                    }

                    break;

                case 'date':
                    data = parseDate(data);
                    if (data !== -1 && data.length) {
                        var dateData = new Date(reverseDate(data));
                        oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME[rida_field], dateData);
                    } else {
                        // erreur sur le format, on place le message d'erreur dans la note ( mettre une alerte sur la note ?)
                        data = "/!\\ format attendu : jj/mm/aaaa";
                        error++;
                    }
                    // On met à jour dans tous les cas, pour homogénéiser la façon dont est stockée la date
                    updateIObeya = true;
                    break;

                    // pour la card, il faut pouvoir passer la date en format unix directement	
                case "datepassthrough":
                    if (!isNaN(data))
                        oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME[rida_field], new Date(data));
                    break;
                case "boolean":
                    if (data == true || data == "TRUE" || data == "true" || data == 1 || data == "1") {
                        oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME[rida_field], true);
                    } else {
                        oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME[rida_field], false);
                    }
                    updateIObeya = true;
                    break;

                default:
                    break;
            }
        } else {
            var debug = true; // TODO: pour déboggage & vérification
        }
        // TODO - TEST - FIX : pb d'import
        /*if (rida_field instanceof Array) {
         for (id in rida_field)
         oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME[rida_field[id]],""); // pour eviter undefined error
         } else {
         if( type == 'date')
         oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME[rida_field], 0); // pour eviter undefined error
         else
         oListItem.set_item(SHAREPOINTLIST_MATCHINGNAME[rida_field], ""); // pour eviter undefined error
         }*/
        // S'il y a des données à faire remonter à l'utilistateur iObeya, à travers le pointeur
        // récupéré de l'objet iObeyaObj

        if (updateIObeya) {
            iObeyaNote.toreupdate = true; // force la mise à jour de la note après le traitement pour afficher la valeur retraitée
            iObeyaPartPtr[key] = data;
        }
    }

    return error;
}

/*
 * Fonction similaire à la function précédente : créer un object contenant l'ensemble des propriétés de l'object iObeya selon le mapping des champs 
 * TODO : voir si l'on ne peut pas utiliser cette fonction dans la précente pour éviter la redondance de code.
 * 
 * @param {type} ridapropertyname
 * @param {type} iObeyaNote
 * @returns {unresolved}
 */

function mapIObeyaToRidaObject(iObeyaNote, iObeyaNodes) {
    var error = 0, updateIObeya = false;
    var RidaObject = {}; // l'object que l'on renverra

    for (var key in IOBEYANOTE_MAPPING) {
        var mappingItem = IOBEYANOTE_MAPPING[key];

        if (mappingItem.class !== iObeyaNote['@class'])
            continue;

        // Vérification de la présence des champs nécessaires
        if (!mappingItem.hasOwnProperty('type')) {
            //throw new InterfaceException("L'objet '"+key+"' de transformation de iObeya vers RIDA ne possède pas de champ \'type\'");
            console.info("L'objet '" + key + "' de transformation de iObeya vers RIDA ne possède pas de champ \'type\'. C'est peut-être normal.");
            continue;
        }
        if (!mappingItem.hasOwnProperty('rida_field')) {
            //throw new InterfaceException("L'objet '"+key+"' de transformation de iObeya vers RIDA ne possède pas de champ \'rida_field\'");
            console.info("L'objet '" + key + "' de transformation de iObeya vers RIDA ne possède pas de champ \'rida_field\'. C'est peut-être normal.");
            continue;
        }

        // Initialisation à partir du template iObeya
        // {'title': 'titre dans iobeya'}
        var iObeyaPartPtr = getiObeyaPropertyObject(iObeyaNote, key);
        var data = iObeyaPartPtr[key];
        // on ne garde que les propriétés liés à l'object iObeya en cours


        var type = mappingItem.type;
        var rida_field = mappingItem.rida_field;

        if (data) {
            // En fonction du type de traitement voulu pour le champ de la note
            switch (type) {
                // Mapping simple, 1 -> 1
                case 'text':
                    // on nettoit les caractères non alphanum
                    data = data.replace(/\t/g, "");
                    data = data.replace(/\n/g, "");
                    data = data.replace(/\r/g, "");
                    data = data.replace(/\f/g, "");

                    if (data.length >= 255) {
                        data = data.substr(0, 254);
                        data = data.concat("…");
                        alert("Le champs text de la note depasse 255 chars, il a été tronqué :\n\n" + iObeyaNote.props.content);
                    }

                    RidaObject[rida_field] = data;

                    break;

                    // Mapping complexe 1 -> n (split du champs source en plusieurs champs )
                case 'concat':

                    if (rida_field instanceof Array) {  // Vérification du type, bien champs à concaténer ?
                        // Définition de la chaine de séparation des champs
                        var concatString = ":"; // Si pas définie, ':' par défaut
                        if (mappingItem.hasOwnProperty('concatString'))
                            concatString = mappingItem.concatString;

                        data = data.split(concatString);

                        rida_field.forEach(function (value, index) {
                            // Protection contre le 'trop de split'
                            if (rida_field[index + 1]) {
                                RidaObject[value] = data.shift().trim();
                            } else {
                                var reConcatenatedData = '';
                                while (data.length > 1) { // Pas jusqu'au dernier élément, il est ajouté en dehors du 'while'
                                    reConcatenatedData += data.shift() + concatString;
                                }
                                reConcatenatedData += data.shift();
                                if (reConcatenatedData == undefined)
                                    alert("data undefined Note : " + iObeyaNote.props.content)
                                RidaObject[value] = reConcatenatedData;
                            }
                        });
                    } else if (rida_field.constructor === String) {
                        RidaObject[rida_field] = data;
                    }
                    break;

                    // Mapping 1 + 'string' -> 1
                case 'numeric':
                    // On récupère le marqueur (ex. ' J/H (RAF)')
                    var unit = '';
                    if (mappingItem.hasOwnProperty('unit'))
                        unit = mappingItem.unit;

                    var numbers = filterNumbers(data);
                    if (numbers !== null) { // OK, car data initalisé à '' et filterNumbers('') = null
                        // on place la valeur dans le RIDA
                        RidaObject[rida_field] = numbers;
                        // on met à jour l'objet iObeya en mémoire avec le texte au bout
                        data = numbers + unit;
                    } else {
                        // Choisir : log | changement de val. iObeya | alert
                        //console.error('Champ de type "numeric" définit sans nombre de jours');
                        data = "/!\\ " + data; // Ajout de /!\ au champ pour alerter de l'erreur
                        error++;
                    }
                    updateIObeya = true;
                    break;

                case 'date':
                    data = parseDate(data);
                    if (data !== -1 && data.length) {
                        RidaObject[rida_field] = data;
                    } else {
                        // erreur sur le format, on place le message d'erreur dans la note ( mettre une alerte sur la note ?)
                        data = "/!\\ format attendu : jj/mm/aaaa";
                        error++;
                    }
                    // On met à jour dans tous les cas, pour homogénéiser la façon dont est stockée la date
                    break;

                case 'datepassthrough': // pour la card on passe la valeur numérique	
                    if (data) {
                        RidaObject[rida_field] = data;
                    } else {
                        error++;
                    }
                    // On met à jour dans tous les cas, pour homogénéiser la façon dont est stockée la date
                    break;

                case "boolean":
                    if (data)
                        if (data == true || data == "TRUE" || data == "true" || data == 1 || data == "1") {
                            RidaObject[rida_field] = true;
                        } else {
                            RidaObject[rida_field] = false;
                        }
                    break;

                default:
                    break;
            }
        } else {
            var debug = true; // TODO: pour déboggage & vérification
        }
    }

    // on récupère les autres informations sur la note 
    var statusObject = findNoteStatus(iObeyaNote, iObeyaNodes); // Statut
    RidaObject.status = statusObject.status;

    if (iObeyaNote['@class'] === "com.iobeya.dto.BoardNoteDTO") { // si note
        if (iObeyaNote.color === NOTE_WARNING_COLOR)         // Echéance ferme (la note est en rouge)
            RidaObject.firmDeadline = true;
        else
            RidaObject.firmDeadline = false;
    }

    RidaObject.idiObeya = iObeyaNote.id;
    RidaObject.datecreation = parseInt(iObeyaNote.creationDate);
    RidaObject.modificationDate = parseInt(getNoteLastModificationDate(iObeyaNote, iObeyaNodes));
    RidaObject.synchroStatus = synchro_status_done;
    RidaObject.PanneauiObeya = iObeyaNote.boardname;
    RidaObject.error = error;
    RidaObject.reupdateIObeya = updateIObeya;

    return RidaObject;
}

/*** Récupère les propriétés intrinsèques à l'étiquette "Acteur" pour la mise à jour RIDA ***/
// par defaut si le label ne correspond pas à un terme acteurs on position une chaine vide dans le rida / acteur
// TODO : voir pour basculer g_actorsTermsList en variables non globale ?


function getLabelProperties(ridaItem, iObeyaLabel) {
    var actorTermId = null, actorname = null, found = false, errors = 0;

    try {
        // on check si la liste des acteurs n'est pas vide... demande son avis à l'utilisateur / retry
        if (!verifieActorsList_sync())
            return 1; // on ne traite pas sinon on risque de vider les acteurs

        // on vérifie (et détermine l'id du termes acteurs )

        if (iObeyaLabel != null) { // le iObeyaLabel n'est pas vide
            for (var i in g_actorsTermsList) { // on vérifie que cela correspond bien à un terme acteurs...

                if ((iObeyaLabel.contentLabel.length == 0)) {
                    console.log("Label content vide ");
                    console.log("titre note : " + iObeyaLabel.notetitle);
                    return 1; // on s'arrête là. Error = +1
                }

                // (ancienne)option avec l'utilisation de la taxonomie, il faut traiter l'object taxonomie sharepoint
                if(SP.Taxonomy)
                if (g_actorsTermsList[i] instanceof SP.Taxonomy.Term) {
                    if (g_actorsTermsList[i].get_name().toLocaleLowerCase() == iObeyaLabel.contentLabel.toLocaleLowerCase()) {
                        actorTermId = g_actorsTermsList[i].get_id().toString(); // l'id du terme dans la taxonomie de sharepoint
                        found = true;
                    }
                }
                // nouvelle option avec l'utilisation d'une liste sharepoint (l'acteur est une colonne)
                if ((g_actorsTermsList[i] instanceof Object)) { // TODO FIX of error of content type

                    if (iObeyaLabel.contentLabel instanceof Array)
                        if (iObeyaLabel.contentLabel[0] instanceof SP.FieldLookupValue) // TODO: etre capable de gérer une multitudes d'acteurs
                            iObeyaLabel.contentLabel = iObeyaLabel.contentLabel[0].get_lookupValue();

                    if (g_actorsTermsList[i]["actor"].toLocaleLowerCase() == iObeyaLabel.contentLabel.toLocaleLowerCase()) {
                        actorid = g_actorsTermsList[i]["ID"]; // l'id du terme dans la taxonomie de sharepoint
                        found = true;
                    }
                }
            } //for (var i in g_actorsTermsList)

            if (!found) { // Alert de l'utilisateur que le terme acteur ne sera pas positionné
                var breakpoint = true; // for debugging, not found

                alert("\nAttention : l'acteur *  "
                        + iObeyaLabel.contentLabel
                        + " * n'existe pas dans la banque de terme (taxonomie) des acteurs de Sharepoint."
                        + "\n\nLe champs 'acteur' de l'entrée dont le titre est : * "
                        + iObeyaLabel.notetitle + " * , ne peut être positionné dans le portail Sharepoint, il ne sera pas modifié. \n"
                        + "\nSi vous pensez que c'est une erreur (orthographe ?), demandez à votre administrateur d'ajouter l'acteur dans la banque de terme ou la liste sharepoint selon votre configuration.\n"
                        + "\nLa synchronisation courante va se poursuivre. \nNotez les éléments de ce message avant de valider.\nLa prochaine synchronisation RIDA > iObeya effacera l'acteur de la note."
                        );
                errors++; // on incrémente les erreur
                ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["actor"], null); // on vide l'acteur
                return ridaItem; // on s'arrête là
            } else {
                // si c'est un acteur issu de la taxonomie, il faut donner l'index du terms
                                if(SP.Taxonomy)
                if (g_actorsTermsList[i] instanceof SP.Taxonomy.Term)
                    ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["actor"], actorTermId);

                // si c'est un acteur issu d'une liste, on renvoie juste le texte
                if (g_actorsTermsList[i] instanceof Object)
                    ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["actor"], actorid);
            } // else

        } else { // il est vide...
            ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["actor"], null);
        }

    } catch (e) {
        throw e;
    }
    return ridaItem;
}

/*** Récupère les propriétés intrinsèques au sticker "% achevé" pour la mise à jour RIDA ***/
function getPercentCompleteStickerProperties(ridaItem, iObeyaPercentCompleteSticker) {
    var errors = 0;

    try {
        if (iObeyaPercentCompleteSticker != null) {
            for (value in PERCENTAGE_IOBEYASTICKER_MAPPING.map) {
                if (PERCENTAGE_IOBEYASTICKER_MAPPING.map[value].id == iObeyaPercentCompleteSticker.stickerImage.id) {
                    ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["percentComplete"], value);
                }
            }
        } else {
            ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["percentComplete"], null);
        }
    } catch (e) {
        throw e;
    }

    return errors;
}

/*** Récupère les propriétés intrinsèques au sticker "Priorité" pour la mise à jour RIDA ***/
function getPriorityStickerProperties(ridaItem, iObeyaPrioritySticker) {
    var errors = 0;

    try {
        if (iObeyaPrioritySticker != null) {
            for (value in PRIORITY_IOBEYASTICKER_MAPPING.map) {
                if (PRIORITY_IOBEYASTICKER_MAPPING.map[value].id == iObeyaPrioritySticker.stickerImage.id) {
                    ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["priority"], value);
                }
            }
        } else {
            ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["priority"], null);
        }

    } catch (e) {
        throw e;
    }

    return errors;
}

// TODO : écrire une fonction pour récupérer les informations d'escallade ?
// a vérifier.
// Pourquoi les autres fonctions doivent faire une boucle sur les propriétés ?

function getEscallationStickersProperties(ridaItem, iObeyaEscallationSticker) {
    var errors = 0;

    try {
        if (SHAREPOINTLIST_MATCHINGNAME.hasOwnProperty("Escallation") && (iObeyaEscallationSticker != null)) { // on traite seulement si la colonne cible est déclarée dans les préférences (ce n'est pas un champs obligatoire) ;
            var value = iObeyaEscallationSticker.name; // or setname ??? à voir en debogging... les autres fonctions utilisent stickerImage.id,pourquoi ?
            ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["Escallation"], value);
        }
    } catch (e) {
        throw e;
    }
    return errors;
}

// TODO : est-ce qu'il faut mettre l'escalade dans le SP ?
/*
 function getEscallationStickerProperties(oListItem, iObeyaEscallationSticker, iObeyaNodes){
 try {
 if (iObeyaEscallationSticker != null) {
 for (value in PRIORITY_IOBEYASTICKER_MAPPING.map) {
 if (PRIORITY_IOBEYASTICKER_MAPPING.map[value].id == iObeyaEscallationSticker.stickerImage.id) {
 ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["priority"], value);
 }
 }
 }
 else {
 ridaItem.set_item(SHAREPOINTLIST_MATCHINGNAME["priority"], null);
 }
 } catch (e) {
 throw e;
 }
 return ridaItem;
 }
 */