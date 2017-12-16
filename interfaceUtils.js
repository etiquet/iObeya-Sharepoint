/***
 
 Authentification sur la plateforme IObeya
 Cette fonction est appelé par d'autres méthode qui précise la fonction appellée en call back.
 Dans le déroulement nominal du script, le call back est la fonction qui qui gère la synchro : function syncNotes(iObeyaConnectedPlatform){
 
 NOTE :  IMPORTANT IMPORTANT IMPORTANT cette portion de code fait largement appel à CORS
 cf. https://en.wikipedia.org/wiki/Cross-origin_resource_sharing
 
 "definition wikipedia :" Cross-origin resource sharing (CORS) is a mechanism that allows restricted resources (e.g. fonts) on a web page to be requested from another domain outside the domain from which the first resource was served.[1]"
 
 Cela nécessite que le serveur iObeya soit correctement configuré 
 ( ce n'est pas activé par défaut il faut paramétrer le CORS dans l'interface d'admin d'iObeya, fct dispo depuis la v3.4)
 
 Le tricks... CORS (le navigateur) execute également un pre-fetch (rerequete) si la requete n'est pas vue comme standard ( post / put / content type non standard )
 le comportement des navigateurs est différent selon les versions pour le prefetch, parfois les credentials (cookies) ne sont pas envoyés.
 L'erreur est donc un rejet par la plateforme iObeya. 
 Deplus : Les implémentations diffèrent selon la version du navigateurs, vérifier que la version du navigateur est récente. 
 ( typiquement eviter la v45 de FireFox )
 
 Attention donc à cet aspect.
 
 TODO : modifier les fonctions d'appels à la plateforme pour permettre un call XHTML via le navigateur ou jsnode (google)
 
 ***/


function iObeyaPlatformLoginAndGetItems(iObeyaConnectedPlatform) {
    var myxmlr, myxmlr2;
    var response = null;
    var iObeyaStruct = {};

    console.log("iObeyaPlatformLoginAndGetItems Called");

    if ((!iObeyaConnectedPlatform) && (!iObeyaConnectedPlatform.PtfURL)) {
        throw new InterfaceException("iObeyaPlatformLoginAndGetItems :: Pas de paramètre de plateforme passée ou erreur");
    }

    var loginfailedMethods = iObeyaConnectedPlatform.loginfailedMethods; // on récupère la fonction callback si failed

    // On vérifie s'il y a deja une connexion active
    // si c'est déja connecté on ne fait qu'appeler la fonction de complétion

    if (iObeyaConnectedPlatform.connected === true) {
        callCallbackFunctions(iObeyaConnectedPlatform.postloginMethods); //si loggué on appelle la/les fonctions de post-sync immédiatement
        return; // on sort d'ici sans code de retour
    }

    // Dans le cas on ce n'est pas connecté on lance la connection et la/les fonctions postloginMethods...
    // 1er appel de connexion à la plateforme pour se logguer.

    myxmlr = new XMLHttpRequest();
    myxmlr.open("GET", iObeyaConnectedPlatform.IOBEYAURL + "/s/j/messages/in", true);
    myxmlr.setRequestHeader("Content-type", "application/x-www-form-urlencoded; charset=utf-8");
    myxmlr.withCredentials = true; // comprendre : les cookies sont passés avec les headers 
    myxmlr.onerror = function (event, iObeyaConnectedPlatform) {
         XMLHttpErrorHandler(event, iObeyaConnectedPlatform);
    };
    myxmlr.onload = function (event) {
        try {
            response = JSON.parse(this.responseText);
            if (response.hasOwnProperty("clientId")) {
                iObeyaConnectedPlatform.clientId = response.clientId;
                iObeyaConnectedPlatform.user = response.user;
            } else {
                XMLHttpErrorHandler(event, iObeyaConnectedPlatform);
                throw new InterfaceException("Error " + response.statusCode + " : when get /s/j/messages/in = " + response.statusMessage);
            }
            // 2nd call on récupère le fichier de config sur serveur, ce qui nous permet d'avoir d'autres informations, telle que la version du client
            // on en extrait la version de la plateforme.
            // https://devptf.iobeya.com/s/download/resources/client-html-plugin/3.4.8.75324/public/#/fr/board/098466F8-F00B-8390-A86A-96A27400BFAA
            // où 3.4.8.75324 est la version courante.

            myxmlr2 = new XMLHttpRequest();
            myxmlr2.open("GET", iObeyaConnectedPlatform.IOBEYAURL + "/s/remoteconfig?f=json", true);
            myxmlr2.setRequestHeader("Content-type", "application/json"); // declanche un prefetch CORS
            myxmlr2.withCredentials = true;

            myxmlr2.onload = function (event) { // TODO : tester si event passe bien
                try {
                    response = JSON.parse(this.responseText);
                    iObeyaConnectedPlatform.client_version = response.server.version;
                    iObeyaConnectedPlatform.connected = response.server.logged; // ( doit être à true)
                    iObeyaConnectedPlatform.connection_message = this.statusText;

                    if (iObeyaConnectedPlatform.connected && iObeyaConnectedPlatform.client_version) {
                        getRooms(iObeyaConnectedPlatform); // on récupère les rooms, appel asynchrone....
                    } else {
                        XMLHttpErrorHandler(event, iObeyaConnectedPlatform);
                    }

                } catch (e) {
                    catchAllThrow(e, loginfailedMethods);
                }
            };

            myxmlr2.onerror = function (event) {
                 XMLHttpErrorHandler(event, iObeyaConnectedPlatform);
            };
            myxmlr2.send();
        } catch (e) {
            catchAllThrow(e, loginfailedMethods);
        }
    }; // myxmlr.onload = function


    myxmlr.send();

} // fonction async donc pas de code de retour

/***
 catchAllThrow Error function dans le cas d'appel à iObeya
 appelé en cas de throw (erreur grave)
 ***/

/*
 * 
 * @param {type} e : object message error
 * @param {type} loginfailedMethods : call back si erreur
 * @returns {undefined}
 * 
 */

function catchAllThrow(e, loginfailedMethods) {
    alert("Erreur lors de l'execution du script :\n\n" + e.message + "\n\n line :\n" + e.stack);
    console.log("stack : " + e.stack);
    if (loginfailedMethods) {
        callCallbackFunctions(loginfailedMethods);
    }
}

/*
 
 Fonction qui gère les erreurs dans un appel https://
 Cette fonction permet le reste du code de synchronisation de se poursuivre
 Appelé dans le cadre du contexte d'une connexion iObeya on inscrit la raison de l'erreur dans le 
 */

function XMLHttpErrorHandler(event, iObeyaConnectedPlatform) { // TODO à vérifier....
//TODO : vérifier les autres paramètres accessibles, par exemple l'url appelle pour passer + d'info dans le message d'erreur...
    var errMessage = event.target.status;
    if (iObeyaConnectedPlatform) {
        iObeyaConnectedPlatform.connection_message = errMessage;
        if (iObeyaConnectedPlatform.loginfailedMethods) { // not connected....
            callCallbackFunctions(iObeyaConnectedPlatform.loginfailedMethods); //si loggué on appelle la/les fonctions de post-sync immédiatement
        }	// on sort naturellement du callback
    } else
        throw new InterfaceException("Erreur à la connexion XMLHttpRequest : " + errMessage);
}

/*** Récupération des rooms ***/

/*
 * 
 * @param {type} iObeyaConnectedPlatform - le contexte de la fonction
 * @returns {undefined}
 * 
 */

function getRooms(iObeyaConnectedPlatform) {
    var loginfailedMethods = iObeyaConnectedPlatform.loginfailedMethods;

    iObeyaConnectedPlatform.activeRoom = null;
    console.log("Fetch rooms");
    iObeyaConnectedPlatform.rooms = new Array(); //TODO : a disparaite

    var myxmlr = new XMLHttpRequest();
    myxmlr.open("GET", iObeyaConnectedPlatform.IOBEYAURL + "/s/j/rooms", true);
    myxmlr.setRequestHeader("Content-type", "application/json"); // déclanche un prefetch CORS
    myxmlr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
    myxmlr.withCredentials = true;

    myxmlr.onerror = function (event, iObeyaConnectedPlatform) {
         XMLHttpErrorHandler(event, iObeyaConnectedPlatform);
    };

    myxmlr.onload = function () {
        try {

            var roomsArray = JSON.parse(this.responseText);
            iObeyaConnectedPlatform.connection_message = this.statusText;

            roomsArray.forEach(function (e) {
                if (e['@class'] === "com.iobeya.dto.RoomDTO") {
                    iObeyaConnectedPlatform.rooms.push({"id": e.id, "name": e.name});
                    // Active room
                    if (e.name === iObeyaConnectedPlatform.ROOM_NAME) {
                        iObeyaConnectedPlatform.activeRoom = e;
                    }
                }
            });

            if (iObeyaConnectedPlatform.activeRoom === null) {
                throw new InterfaceException("La room \"" + iObeyaConnectedPlatform.ROOM_NAME + "\" n'existe pas dans la plateforme iObeya à l'URL : " + iObeyaConnectedPlatform.IOBEYAURL);
            }

            // GET BOARDS
            getBoards(iObeyaConnectedPlatform);
        } catch (e) {
            catchAllThrow(e, loginfailedMethods);
        }
        // nextRequest(); // pourquoi ???? +>> commenté pour confirmer que cela fonctionne sans...
    }; // onload

    myxmlr.send();
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

/*
 * getBoards : récupère les boards
 * @param {type} iObeyaConnectedPlatform
 * @returns {undefined}
 */

function getBoards(iObeyaConnectedPlatform) {
    var loginfailedMethods = iObeyaConnectedPlatform.loginfailedMethods;

    console.log("Fetch boards");
    if (iObeyaConnectedPlatform.boards instanceof Array)
        iObeyaConnectedPlatform.boards.length = 0;  // raz
    else
        iObeyaConnectedPlatform.boards = new Array();

    if (iObeyaConnectedPlatform.iObeyaNodes instanceof Array)
        iObeyaConnectedPlatform.iObeyaNodes.length = 0; // raz
    else
        iObeyaConnectedPlatform.iObeyaNodes = new Array();

    // le nombre attendu de boards.
    iObeyaConnectedPlatform.countBoardtoload = iObeyaConnectedPlatform.BOARDSTOSYNC.length;

    var myxmlr = new XMLHttpRequest();
    myxmlr.open("GET", iObeyaConnectedPlatform.IOBEYAURL + "/s/j/rooms/" + iObeyaConnectedPlatform.activeRoom.id + "/details", true);
    myxmlr.setRequestHeader("Content-type", "application/json");
    myxmlr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
    myxmlr.withCredentials = true;

    myxmlr.onerror = function (event, iObeyaConnectedPlatform) {
         XMLHttpErrorHandler(event, iObeyaConnectedPlatform);
    };

    myxmlr.onload = function () {
        try {
            iObeyaConnectedPlatform.connection_message = this.statusText;
            iObeyaConnectedPlatform.roomallboards = [];

            var tempboard = JSON.parse(this.responseText); // on stocke cette valeur, si besoin plus tard

            // on loop sur l'Array
            tempboard.forEach(function (elmnt) { // on loop sur l'array reçu
                if (elmnt['@class'] === "com.iobeya.dto.BoardDTO") { // filtrage par type
                    // on filtre sur les panneaux qui nous intéressent depuis la conf
                    iObeyaConnectedPlatform.BOARDSTOSYNC.forEach(function (board) {

                        iObeyaConnectedPlatform.roomallboards.push(elmnt); // on ajoute toute les boards à cet array.

                        if (elmnt.name === board) { // ce panneau doit être synchronisé ?
                            console.log(" found configured nameBoard: \"" + elmnt.name);
                            iObeyaConnectedPlatform.boards.push(elmnt); // on ajoute la board dans l'array

                            // Note : on determine quelle l'id de la board par defaut dans l'Array de configuration. ( le dernier de l'array )
                            // permet d'avoir une valeur par defaut dans les recherches par la suite, 
                            // typiquement si l'utilisateur utilise un mauvais nom de panneau dans le RIDA.
                            // Dans ce cas on défini que c'est le premier du tableau de paramétrage qui est la valeur par défaut
                            // mais comme les boards d'iObeya peuvent être dans un ordre différent, il faut déterminer l'index.

                            if (elmnt.name === iObeyaConnectedPlatform.BOARDSTOSYNC[0])
                                iObeyaConnectedPlatform.defaultboard_index = iObeyaConnectedPlatform.iObeyaNodes.length - 1;

                            iObeyaConnectedPlatform.boardfound++;
                            getNodes(iObeyaConnectedPlatform, elmnt.id, elmnt.name);
                        }
                    });
                } //if (elmnt["@class"] === "com.iobeya.dto.BoardDTO")
            }); //for each
        } catch (e) {
            catchAllThrow(e, loginfailedMethods);
        }
    };

    myxmlr.send(); // on lance l'appel de la méthode asynchrone.
    waitallBoardLoaded(iObeyaConnectedPlatform); // Attente du changement des boards  
}

function getNodes(iObeyaConnectedPlatform, boardid, boardname) {
    var myxmlr = null;
    var loginfailedMethods = iObeyaConnectedPlatform.loginfailedMethods;
    console.log("Getting nodes");

    myxmlr = new XMLHttpRequest();
    myxmlr.open("GET", iObeyaConnectedPlatform.IOBEYAURL + "/s/j/boards/" + boardid + "/details", true);
    myxmlr.setRequestHeader("Content-type", "application/json");
    myxmlr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
    myxmlr.withCredentials = true;

    myxmlr.onerror = function (event, iObeyaConnectedPlatform) {
         XMLHttpErrorHandler(event, iObeyaConnectedPlatform);
    };
    myxmlr.onload = function () {

        try {
            var data = JSON.parse(this.responseText);
            iObeyaConnectedPlatform.connection_message = this.statusText;
            for (var i = 0; i < data.length; i++) {
                // Stickers : récupération de l'ID de l'asset

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

                // Stockage des proprietés du tableau/url/room en cours
                data[i].boardname = boardname;
                data[i].boardid = boardid;
                data[i].roomname = iObeyaConnectedPlatform.activeRoom.name;
                data[i].roomid = iObeyaConnectedPlatform.activeRoom.id;
                data[i].target_url  = iObeyaConnectedPlatform.IOBEYAURL;

                // Objets dessinables et tri des notes visibles
                // zorder est la condition pour filtrer un objet visible des panneaux d'autres choses.
                if (data[i].hasOwnProperty("zOrder")) {
                    iObeyaConnectedPlatform.iObeyaNodes.push(data[i]);
                }
            }

            // On sort les données reçes
            iObeyaConnectedPlatform.iObeyaNodes.sort(function (obj1, obj2) {
                return parseInt(obj1.zOrder) - parseInt(obj2.zOrder);
            });

            iObeyaConnectedPlatform.countBoardtoload--; // pour gérer l'asynchronisme on décompte le compteur global
        } catch (e) {
            catchAllThrow(e, loginfailedMethods);
        }
    };

    myxmlr.send(); // on lance la requete en asynchrone...
}

//
// fonction qui permet d'attendre que l'ensemble des load on été effectués
// le mode asynchrone oblige a utiliser un timer
// appelle la fonction *iObeyaLoggedInCallBackFunction* quand terminé

function waitallBoardLoaded(iObeyaConnectedPlatform) {
    console.log(
            "entering timered function : waitallBoardLoaded, with "
            + iObeyaConnectedPlatform.boardfound
            + "boards to load, awaited (BOARDSTOSYNC): "
            + iObeyaConnectedPlatform.BOARDSTOSYNC.length
            );

    iObeyaConnectedPlatform.waitcount = 0; // as global counter

    var timerId = window.setInterval(function (iObcotf) {

        if (!iObcotf.countBoardtoload) {  // >0 tant que tous les panneaux n'ont pas été lu...   

            // on lance ici la fonctionne de synchro
            clearInterval(timerId);
            console.log("Loaded board complete" + iObcotf.boardfound);

            var postloginMethods = iObcotf.postloginMethods;
            if (postloginMethods)
                callCallbackFunctions(postloginMethods);

            // nextRequest(); // TODO, @etiquet on commente pour voir si cela fonctionne sans....
            // on dépile maintenant la queue des requetes async à lancer à la fin
            // TODO à retravailler ??? s'il y a plusieurs plateforme / room en jeu.
            // Ne faudrait pas placer l'appel de cette fonction dans le code de l'appel source de la fonction ???
        }

        // gestion d'un timeout si le nb attendu de board n'a pas été chargé.

        if (iObcotf.waitcount > 5 * 2) { // 5 secondes maximum for loading....
            if (confirm("Seulement " + iObcotf.boardfound + "/" + iObcotf.BOARDSTOSYNC.length + " Boards ont été chargés, poursuive ou annuler ? \n\n (Q: paramétrage ok ?) "))
                iObcotf.waitcount = 0;
            else
                catchAllThrow(new InterfaceException("Abandon du loading"), iObcotf.loginfailedMethods);
        }
        iObcotf.waitcount++;
    }, 500, iObeyaConnectedPlatform); // on check toute les 1/2 secondes
}


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
function escapeCharacters(str) {
    return (str + '')
//        .replace(/[\\"']/g, '\\$&') // Ni RIDA ni iObeya ne semble sensibles à ces caractères
            .replace(/\u0000/g, '\\0');
}

/*** Formatage des données (contrôle des caractères spéciaux) ***/

/*
 * 
 * @param {type} str
 * @returns {String}
 */

function parseNoteText(str) {
    str = escapeCharacters(str);
    //str = str.replace(/[^a-z0-9 áàâäãåçéèêëíìîïñóòôöõúùûüýÿæœÁÀÂÄÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝŸÆŒ\s_\-,.?!';]/ig, '');

    return str;
}

/*** 
 Formatage de la date (dont le jour et le mois sont inversés lorsque interprétés par navigateur 
 retourne -1 si la date n'est pas bien formatée
 
 ***/

/*
 * 
 * @param {type} date
 * @returns {Number|String}
 */

function parseDate(date) {
    var l_date, sep, str = date, defyear, defmonth, defday, day, month, year;

    // On calcule l'année par défaut
    defyear = Date.now();

    // on verifie que l'on a une pattern de date
    // JJMMAA JJMMAAAA JJ/MM/AA JJ/MM/AAAA JJ MM AA JJ MM AAAA JJ-MM-AA JJ-MM-AAAA    
    if (!/\d{1,2}[\/]\d{1,2}[\/]\d{2,4}/.test(date))
        if (!/\d{1,2}[\ ]\d{1,2}[\ ]\d{2,4}/.test(date))
            if (!/\d{1,2}[\-]\d{1,2}[\-]\d{2,4}/.test(date))
                if (!/\d{6,8}/.test(date))
                    return -1; // erreur sur le format; 

    sep = str.indexOf("/");
    if (sep > 0) {
        l_date = str.split("/"); // décomposition
    } else {
        sep = str.indexOf("-");
        if (sep > 0) {
            l_date = str.split("-"); // décomposition
        } else {
            sep = str.indexOf(" ");
            if (sep > 0) {
                l_date = str.split(" "); // décomposition

            } else {
                // on test si 6 ou 8 chiffre qui se suivent
                var reg = /[0-9]+/g; // on ne garde que les chiffres
                var date = reg.exec(date).toString();

                if (date.length === 8) {
                    var day = parseInt(date.substr(0, 2));
                    var month = parseInt(date.substr(2, 2));
                    if (month > 12)
                        month = 12;
                    if (month < 1)
                        month = 1;
                    if (day > 31)
                        day = 31;
                    if (day < 1)
                        day = 1;
                    var year = parseInt(date.substr(4, 4));
                    day = day.toString();
                    month = month.toString();

                    if (day.length < 2)
                        day = "0" + day.toString();
                    if (month.length < 2)
                        month = "0" + month;

                    return day + "/" + month + "/" + year.toString();

                } else if (date.length === 6) {
                    var day = parseInt(date.substr(0, 2));
                    var month = parseInt(date.substr(2, 2));
                    if (month > 12)
                        month = 12;
                    if (month < 1)
                        month = 1;
                    if (day > 31)
                        day = 31;
                    if (day < 1)
                        day = 1;
                    var year = parseInt(date.substr(4, 2));
                    var y2 = new Date;
                    y2 = parseInt(y2.getFullYear());
                    year = Math.round(y2 / 100) * 100 + year;  // on prend centaibe  courante
                    day = day.toString();
                    month = month.toString();

                    if (day.length < 2)
                        day = "0" + day.toString();
                    if (month.length < 2)
                        month = "0" + month;

                    return day + "/" + month + "/" + year.toString();
                }
                // else

                return -1; // erreur sur le format; 
            }
        }
    }

    // on regarde combien de block, 1 block = jour, 2 block = jour / mois, 3 block jour / mois / année.
    //.getFullYear()

    switch (l_date.length) {

        case 3:
            var day = parseInt(l_date[0]);
            var month = parseInt(l_date[1]);
            if (month > 12)
                month = 12;
            if (month < 1)
                month = 1;
            if (day > 31)
                day = 31;
            if (day < 1)
                day = 1;
            day = day.toString();
            month = month.toString();

            if (day.length < 2)
                day = "0" + day.toString();

            if (month.length < 2)
                month = "0" + month;
            var year = parseInt(l_date[2]);
            if (year < 100) {

                var y2 = new Date;
                y2 = parseInt(y2.getFullYear());
                year = Math.round(y2 / 100) * 100 + year;  // on prend centaibe  courante
            }

            return day + "/" + month + "/" + year.toString();
            break;

        case 2:
            var day = parseInt(l_date[0]);
            var month = parseInt(l_date[1]);
            if (month > 12)
                month = 12;
            if (month < 1)
                month = 1;
            if (day > 31)
                day = 31;
            if (day < 1)
                day = 1;
            day = day.toString();
            month = month.toString();

            if (day.length < 2)
                day = "0" + day.toString();
            if (month.length < 2)
                month = "0" + month

            var y2 = new Date;
            var year = y2.getFullYear();
            return day + "/" + month + "/" + year.toString();

            break;

        default: // pas une bonne date
            return -1; // erreur sur le format.
            break;

    }

}



/* Formatage de la date (dont le jour et le mois sont inversés lorsque interprétés par navigateur
 * 
 * @param {type} date
 * @returns {String}
 */

function reverseDate(date) {

    var regex = /^(0[1-9]|[12][0-9]|3[01])[- /.](0[1-9]|1[012])[- /.]((19|20)\d\d)$/;
    var match = date.match(regex);

    if (match === null || match === undefined) {
        return match;
    } else {
        return match[2] + "/" + match[1] + "/" + match[3];
    }

}

/*** Formatage de la charge (valeur attendue : "DECIMAL STRING") 
 * @param {type} workload
 * @returns {filterNumbers.match}
 */
function filterNumbers(workload) { // ne garde que les digits et ,
    var regex = /^([0-9]+(,[0-9]+)?)/, match = workload.match(regex);

    if (match === null || match === undefined) {
        return match;
    } else {
        return match[0].replace(",", "."); // convertit , en . (décimal sharepoint)
    }

}

/*** Fonction de callback appelée si une requête executeQueryAsync a échoué
 * 
 * @param {type} sender
 * @param {type} args
 * @returns {undefined}
 */
function onQueryFailed(sender, args) {
    var msg = "Request failed. " + args.get_message() + "\n" + args.get_stackTrace();
    alert(msg);
    console.log(msg);
    // Réactivation du bouton
    ErrorLogingReloadPage();
}

/**
 * Fonction de callback appelée si une requête executeQueryAsync est exécutée avec succès
 */
function onQuerySucceeded(args) {

    console.log("Item created: " + args.get_id());
}

/**
 * À partir de l'identifiant 'syncID', crée les variables globales définies dans SYNC_PROPERTIES_MAP
 * @param syncID String: jeu de paramètres de SYNC_PROPERTIES_MAP.
 * Si omis ou invalide, est mis à la valeur 'default'
 * @throws InterfaceException: Le jeu de propriétés 'syncID' n'existe pas
 */
function loadSyncConf(syncID) {

    if (!SYNC_PROPERTIES_MAP.hasOwnProperty(syncID)) {
        throw new InterfaceException("Le jeu de propriétés '" + syncID + "' n'existe pas");
    }

    try {
        var syncMap = SYNC_PROPERTIES_MAP[syncID];

        // On charge d'abord les propriétés héritées
        if (syncMap.hasOwnProperty('inherits') && syncMap.inherits) {
            loadSyncConf(syncMap.inherits); // Du récursif, pas de soucis car peu de profondeur
        }

        // On a un objet sans parent : report des propriétés trouvées dans des variables globales de même nom
        var underscoresCapitals = /^[A-Z_]*$/; // On n'authorise que les majuscules et les underscores
        for (var property in syncMap) {
            if (!syncMap.hasOwnProperty(property) // Lève un warning d'inspection de code...
                    || !property.match(underscoresCapitals))
                continue;

            if (syncMap[property].constructor === Object) {
                // Si la variable globale 'property' n'existe pas, on la crée
                // > window[x] = 12; équivaut à > x = 12; avec x variable globale
                if (!window.hasOwnProperty(property)) {
                    window[property] = {};
                }
                for (var i in syncMap[property]) {
                    if (!syncMap[property].hasOwnProperty(i))
                        continue; // Lève un warning d'inspection de code...
                    // > window[property][i] équivaut (par ex.) à SHAREPOINTLIST_MATCHINGNAME['actor']
                    window[property][i] = syncMap[property][i];
                    // Exemple d'effet réel de la ligne ci-dessus :
                    //SHAREPOINTLIST_MATCHINGNAME = SYNC_PROPERTIES_MAP[syncID]['SHAREPOINTLIST_MATCHINGNAME'];
                }
            } else if (syncMap[property].constructor === String
                    || syncMap[property].constructor === Array) {
                window[property] = syncMap[property];
            }
        }
    } catch (e) {
        throw e;
    }
    // On a fait le mapping des propriétés trouvées.
    // Si on est dans un appel récursif, la continuité de la fonction appelante va écraser/créer des propriétés
}

/**
 * Convertit une chaîne de caractères représentant une date au format DD/MM/YYY vers une autre chaîne au format
 * MM/DD/YY (ex: "23/11/2017" -> "11/23/2017") utilisé notamment pour insérer la dueDate d'une tâche/note dans
 * la liste SharePoint LISTLOG_TITLE
 * @param dmyDate chaîne de caractères au format "DD/MM/YYYY"
 * @returns chaîne de caractères au format "MM/DD/YYYY" si @param valide, false sinon
function convertDMYToMDY(dmyDate) {

    let dmyArray = dmyDate.split("/");

    if ( (typeof dmyDate === 'string' || dmyDate instanceof String)
        && !dmyArray.some(isNaN) )
    {
        return dmyArray[1] + '/' + dmyArray[0] + '/' + dmyArray[2];
    }

    return null;
}*/

/**
 * Convertit un objet Date en une chaïne de caractères "JJ/MM/YYYY"
 * exemple : Fri Nov 24 2017 14:44:52 GMT+0100 (Paris, Madrid) -> "24/11/2017"
 * @param date objet Date
 * @returns {string} "JJ/MM/YYYY"
 */
function prettyDate(date) {
    // getUTCMonth() renvoie un entier entre 0 et 11 donc + 1
    // (cf https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getUTCMonth)
    var month = date.getUTCMonth() + 1;

    return date.getUTCDate() + "/" + month + "/" + date.getUTCFullYear();
}