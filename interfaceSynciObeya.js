/**
 Change log...
 
 // version mai 2017
 
 
 //version septembre 2017
 
 Réécriture et refactoring du code pour permettre que plusieurs plateformes iObeya peuvent maintenant être connectées a une liste sharepoint. La nouvelle façons de faire permet de gérer une structure "connextion à une plateforme" qui peux être multiple.
 
 voir function InitiateiObeyaWorkingContextVariables(createConnectionElement) pour la description de l'array utilisé
 
 Ajout fonctionnel : escalade vers un autre panneau. ( nouveaux paramètres dans le fichier de conf...) le dépot d'un sticker "escallade" déclanche selon le paramétrage un clonage de l'item vers une autre boards. ( qui peut être sur une autre plateforme iObeya)
 
 Refactoring de code :
 - utilisation accrue de callback pour les fonctions de connextion.
 - revue / réécriture / simplification de code de nombreuses fonctions.
 - utilisation de callback success - failed pour la fonction de connexion a une plateforme iObeya.
 
 //version juillet 2017
 utilisation de liste sharepoint pour les acteurs
 capacité de paramétrer la correspondances des champs entre une note et un sharepoint
 capacité de pouvoir paramétrer autant que listes sharepoint / iobeya ptf sur une collection de site.
 nouvelle structure du fichier de paramétrage hérarchique et par héritage, permettant d'adresser des plateformes iobeya différentes par paramêtre.
 
 
 // version janvier 2017
 Capacité de basculer une note d'un panneau à l'autre
 
 // -- //
 
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
 
 performSyncActions ()
 - mise en oeuvre de la synclist :
 - traitement des erreurs (mise à jours du status de la sync dans la liste sharepoint)
 - information à l'utilisateur sur les statistiques de la synchro
 - clean-up / fin
 
 Note: la mise à jour d'iObeya est effectuée en block à la fin, un array elementsToCommit est créé contenant l'ensemble des créations / updates dans iObeya à gérer
 
 Comme le script est écrit en Javascript de nombreux mécanismes de gestion de l'asynchrone sont en place,
 par exemple un timer de supervision d'attente des threads de fin
 
 */

/**
 * Note : pensez que le fichier interfaceConfig.js est inclus dans les en-tete http,
 * il contient des variables générales comme le nom de la room / du sharepoint ainsi que des tableaux de correspondances
 * les Labels sont en MAJUSCULES pour différentiation dans le code
 */

// Versionning du script
g_versionscript = "(v1.3) ";

var status_todo = 0x10;
var status_done = 0x20;
var status_failed = 0x30;
var status_nil = 0x50;

var synchro_status_done = "OK";
var synchro_status_failed = "Erreur";
var synchro_status_nil = "";

/*** Variables globales du script ***/
var g_iObeyaPlatforms = []; // l'array de plateformes iObeya connectées;

// TODO : vérifier si l'on besoin de ces variables en "global".
var g_notificationID; // l'id de l'indicateur d'avancement
var g_lockSync; // pour vérifier qu'il n'a pas d'autre instance en route
var g_syncErrors = 0;
var g_actorsTermsList = [];

// on stocke le context SP courant, il semble que sharepoint nécessite l'utilisation de ces variables globales.
var g_context;
var g_oList;

/**
 * Initialisation de la synchronisation avec iObeya Lié à sharepoint. fonction appelée depuis le bouton iObeya
 * @param syncID
 */
function startSync(syncID) {
    var entry, wname;

    try {
        if (!syncID) {
            console.log("Pas de jeu de paramètres donné, on prend la valeur par défaut");

            // on recherche la liste selon le titre de la page
            wname = window.document.title;

            for (entry in SYNC_PROPERTIES_MAP) {
                if (wname.includes(SYNC_PROPERTIES_MAP[entry].LISTSHAREPOINT_TITLE)) {
                    syncID = entry;
                }
            }

            if (!syncID) {
                alert("Le paramètrage de synchronisation iObeya de cette n'est pas configuré," +
                        "\n veuillez contactez votre administrateur");
                return;
            }

        }

        // occurence improbable, mais au cas où...
        if (g_lockSync === true) {
            throw new InterfaceException("Une autre instance est déjà en cours, veuillez patienter.\nlockSync==true");
        }

        // Chargement des variables globales
        // TODO what if FAILED ? <<- throw exception. Caught below
        loadSyncConf(syncID);
        initiateiObeyaPlateformeMainStruct(syncID);

        // Callback methods qui seront appellées quand/si le processus de synchronisation avance avec condtions succes/failed
        // Cela permet de reproduire un fonctionnement synchrone alors que tout les appels aux plateformes sont asynchrones.
        // Il est possible d'utiliser une fonction ou un array de fonctions executées les unes après les autres.

        // La première utilisation : appel après le login sur sharepoint pour récuperer la liste RIDA
        // 1 - pour lancer le login iObeya, => connectiObeyaPtf
        // 2 - qui lancera à son tour la syncho. syncNotes(iObeyaConnectedPlatform)
        // 3 - qui appellera SharePointReloaded une fois la premiere passe de synchro réalisée.

        g_iObeyaPlatforms[IOBEYAURL].failedMethods = function () {
            ErrorLogingReloadPage("from initialisation");
        };
        g_iObeyaPlatforms[IOBEYAURL].succesMethods = []; // on utilise un array de fonction ;)
        g_iObeyaPlatforms[IOBEYAURL].succesMethods.push(
                function () {
                    connectiObeyaPtf(g_iObeyaPlatforms[IOBEYAURL]);
                }
        );

        //TODO,evolution :faire un swith ici pour gérer d'autres sources de données que Sharepoint.
        // Note : le contexte ne peut être récupéré que si le script sp.js est loadé, 
        // utilise la fonction suivante pour ça

        ExecuteOrDelayUntilScriptLoaded(function () {

            g_context = new SP.ClientContext.get_current(); // on stocke le context SP courant
            g_oList = g_context.get_web().get_lists().getByTitle(LISTSHAREPOINT_TITLE);

            g_iObeyaPlatforms[IOBEYAURL].clientContext = g_context;
            g_iObeyaPlatforms[IOBEYAURL].oList = g_oList;

            // Pour détecter qu'une autre thread est active
            disableButton();
            // refreshTable(g_iObeyaPlatforms[IOBEYAURL].clientContext);     // TODO : Rafraîchissement de la vue, ???

            // attention appel asynchrone.
            retrieveActorsList_sync(g_iObeyaPlatforms[IOBEYAURL]);

            /**
             * when succeed following method will callbacks function specified .succesMethods when SP list retrieved
             * ( ex: syncNotes(g_iObeyaPlatforms[IOBEYAURL]) ),
             * result in .ridaNodes[] variables of g_iObeyaPlatforms[IOBEYAURL]
             */
            retrieveRidaListItems(g_iObeyaPlatforms[IOBEYAURL]);
        }, "sp.js");
    } catch (e) {
        catchAllThrow(e, g_iObeyaPlatforms[IOBEYAURL]);
    }
}

/**
 * Désactivation du bouton (traitement en cours)
 */
function disableButton() {
    varTitle = "Préparation de la synchronisation...";
    varMsg = g_versionscript + "Connexion à Sharepoint...";
    g_notificationID = SP.UI.ModalDialog.showWaitScreenWithNoClose(varTitle, varMsg, 120, 700);
    g_lockSync = true;
}

function initiateiObeyaPlateformeMainStruct(syncID) {
    // Initiate iObeyaPlatform object
    // TODO : basculer les noms des variables de la structure en minuscule...

    g_iObeyaPlatforms.defaultUrl = IOBEYAURL;
    g_iObeyaPlatforms[IOBEYAURL] = [];
    g_iObeyaPlatforms[IOBEYAURL].parent = g_iObeyaPlatforms;

    // on initialise les valeurs génériques par défaut
    InitiateiObeyaWorkingContextVariables(g_iObeyaPlatforms[IOBEYAURL]);

    // variables d'environnement
    g_iObeyaPlatforms[IOBEYAURL].IOBEYAURL = IOBEYAURL;
    g_iObeyaPlatforms[IOBEYAURL].ROOM_NAME = ROOM_NAME;
    g_iObeyaPlatforms[IOBEYAURL].BOARDSTOSYNC = BOARDSTOSYNC;
    g_iObeyaPlatforms[IOBEYAURL].PERCENTAGE_IOBEYASTICKER_MAPPING = PERCENTAGE_IOBEYASTICKER_MAPPING;
    g_iObeyaPlatforms[IOBEYAURL].PRIORITY_IOBEYASTICKER_MAPPING = PRIORITY_IOBEYASTICKER_MAPPING;
    g_iObeyaPlatforms[IOBEYAURL].ESCALLATION_MAPPING = ESCALLATION_MAPPING;
    g_iObeyaPlatforms[IOBEYAURL].DROP_ZONE = DROP_ZONE;
    g_iObeyaPlatforms[IOBEYAURL].syncID = syncID;
    g_iObeyaPlatforms[IOBEYAURL].failedMethods = null;
    g_iObeyaPlatforms[IOBEYAURL].succesMethods = null;

}

/**
 * Function qui peut être appelée si une erreur survient, pour remettre la page Sharepoint dans un état normal
 * la variable permet de passer un paramètre qui ne sert que pour le deboggage pour indiquer qui a appelé cette fonction
 * @param variable
 * @constructor
 */
function ErrorLogingReloadPage(variable) {

    if (g_notificationID)
        g_notificationID.close(SP.UI.DialogResult.OK);

    g_notificationID = SP.UI.ModalDialog.showWaitScreenWithNoClose(variable, "La page va se recharger automatiquement", 120, 700);
    // TODO ou ? SP.UI.Notify.removeNotification(g_notificationID);
    g_lockSync = false;
    var msg = "Entering ErrorLogingReloadPage (  last sync code )";
    if (variable)
        var msg = msg + variable;
    console.log(msg);
    window.location.reload(); // rafraichi la page
}

/* Rafraîchissement du tableau RIDA
 *
 * @param {type} context
 * @returns {undefined}
 * TODO: vérifier l'utilité de ce code...
 */

function refreshTable(context) {
    var ctx = SP.ClientContext.get_current();
    var evtAjax = {
        currentCtx: ctx,
        csrAjaxRefresh: true
    };
    // If set to false all list items will refresh
    ctx.skipNextAnimation = true;
    AJAXRefreshView(evtAjax, SP.UI.DialogResult.OK);
}

/**
 * Action de synchronisation avec iObeya
 * cette fonction est appelée en cascade via un passage de parramètre via :
 * - checkIn(iObeyaLoggedInCallBackFunction) qui est appelé par onGetQuerySucceeded(sender, args) {)
 * dans interfacegetItems.js
 * TODO : transformer la fonction pour quelle fonctionne avec la liste des plateforms iObeya comme paramètre
 * @param iObeyaConnectedPlatform
 */

function connectiObeyaPtf(iObeyaConnectedPlatform) {

    // Initialisation de la connexion sur iObeya
    // vérification qu'il n'a pas déjà eu un appel dans le passé ou qu'une autre synchro est en cours...

    if (iObeyaConnectedPlatform.synclist instanceof Array)
        if (iObeyaConnectedPlatform.synclist.length > 1) {
            throw new InterfaceException("Une autre instance est déjà en cours sur votre navigateur Exiting...\n syncList!=0 ");
        }

    if (g_notificationID)
        g_notificationID.close(SP.UI.DialogResult.OK);
    varTitle = "Préparation de la synchronisation...";
    varMsg = g_versionscript + "Connexion à IObeya...";
    g_notificationID = SP.UI.ModalDialog.showWaitScreenWithNoClose(varTitle, varMsg, 120, 700);
    g_iObeyaPlatforms[IOBEYAURL].succesMethods = []; // on utilise un array de fonction ;)
    g_iObeyaPlatforms[IOBEYAURL].succesMethods.push(
            function () {
                syncNotes(g_iObeyaPlatforms[IOBEYAURL]);
            }
    );
    iObeyaPlatformLoginAndGetItems(iObeyaConnectedPlatform);
}

function syncNotes(iObeyaConnectedPlatform) {

    try {

        console.log("Entering syncNotes");
        console.log(iObeyaConnectedPlatform.iObeyaNodes.length + " iObeyaNodes entries");
        console.log(iObeyaConnectedPlatform.ridaNodes.length + " Rida entries");

        if (g_notificationID)
            g_notificationID.close(SP.UI.DialogResult.OK);
        var Title = "Préparation de la synchronisation...";
        var Msg = g_versionscript + "Analyse des données reçues...";
        g_notificationID = SP.UI.ModalDialog.showWaitScreenWithNoClose(Title, Msg, 120, 700);

        // Détermination des actions à effectuer, création d'un fichier de changement
        var l_synclist = compareforSyncAction(iObeyaConnectedPlatform);

        if (l_synclist)
            if (l_synclist.length) {
                iObeyaConnectedPlatform.synclist = l_synclist;

                if (!verifieActorsList_sync()) // si la liste des acteurs n'a pas été chargée, c'est un pb pour la synchro, on s'arrête.
                    throw new InterfaceException("La liste des acteurs n'a pas pu être chargée, recommencer...");

                // on affiche un dialogue à l'utilisateur pour demander sa confirmation pour lancer la Synchro.

                var stats = getStats(l_synclist);
                var statsMessage = "- Sens Rida > iObeya : \n\n"
                        + stats[syncType.todo_createiObeya] + " Note(s) à créer\n"
                        + stats[syncType.todo_synciObeya] + " Note(s) à synchroniser\n"
                        + stats[syncType.todo_removeiObeya] + " Note(s) à placer à la corbeille\n"
                        + stats[syncType.todo_moveBoardiObeya] + " Note(s) à changer de panneau\n\n"
                        + "- Sens iObeya > Rida : \n\n"
                        + stats[syncType.todo_createRida] + " Tâche(s) à créer\n"
                        + stats[syncType.todo_syncRida] + " Tâche(s) à synchroniser\n"
                        + stats[syncType.todo_removeRida] + " Tâche(s) à désactiver\n\n"
                        + "- Sens iObeya > iObeya : \n\n"
                        + stats[syncType.todo_cloneiObeya] + " Tâche(s) à cloner\n";

                if (confirm("Vous avez demandé une synchronisation entre la liste Sharepoint courante et les panneaux iObeya suivants :  \n\n"
                        + BOARDSTOSYNC
                        + ".\n\n"
                        + statsMessage
                        + " \n\nSouhaitez-vous continuer ?\n\n"
                        + "(Liste de paramètres utilisée : "
                        + iObeyaConnectedPlatform.syncID
                        + ")")) { // confirmation de l'utilisateur

                    // vérifie s'il fait se connecter à d'autres plateformes
                    // typiquement pour gérer des escallades / clonage
                    // attention... calls asynchrones
                    if (g_notificationID)
                        g_notificationID.close(SP.UI.DialogResult.OK);
                    varTitle = "Mise en oeuvre  de la synchronisation...";
                    var Msg = g_versionscript + " " + l_synclist.length + "Initialisation des requêtes de synchro";
                    g_notificationID = SP.UI.ModalDialog.showWaitScreenWithNoClose(varTitle, Msg, 120, 700);
                    ConnectAlliObeyaPlatforms(iObeyaConnectedPlatform);
                    // on attend que tout les plateformes soient connectées, et on appelle le callbackF
                    // s'il n'y a pas de besoin de nouvelles connections, le callback est appellé immédiatement
                    // callback est la fonction qui effectue les opérations de CRUD ( créate, update, delete ) pour faire la synchro
                    WaitAlliObeyaPlatformsConnected(iObeyaConnectedPlatform,
                            function () {
                                performSyncCRUDs(iObeyaConnectedPlatform);
                            });
                } else { // cancel
                    ErrorLogingReloadPage("Annulation de l'utilisateur");
                }
            } else {
                /*alert("\n\n *** IL N'Y A PAS D'ELEMENT A SYNCHRONISER ***  \n\n ");*/
                ErrorLogingReloadPage("Pas d'éléments à synchroniser");
            }
    } catch (e) {
        catchAllThrow(e, iObeyaConnectedPlatform);
    }
    // on sort tranquillement (functions async)
}


/*
 * performSyncCRUDs :
 * Fonction qui est appellée lorsque que l'ensemble des connections sont effectives
 * pour réaliser les opérations de synchronisations déjà identifiées (cf array l_synclist)
 *
 * @param {type} iObeyaConnectedPlatform
 * @returns {undefined}
 * //TODO: fonction performSyncActions a reecrire
 
 */

function performSyncCRUDs(iObeyaConnectedPlatform) {

    try {
        // on boucle sur l'ensemble des plateformes connectées pour préparer les requêtes CRUDs.

        for (var i in iObeyaConnectedPlatform.parent) {
            var l_connectedPtf = iObeyaConnectedPlatform.parent[i]; // on récupère la propriété
            if (l_connectedPtf.hasOwnProperty("connected")) { //attention : tout n'est pas un array...

                if (l_connectedPtf.connected) { //et que la plateforme est connectée...
                    if (g_notificationID)
                        g_notificationID.close(SP.UI.DialogResult.OK);
                    var Msg = g_versionscript + "Préparation des requêtes de synchro (" + l_connectedPtf.synclist.length + ") noeuds";
                    g_notificationID = SP.UI.ModalDialog.showWaitScreenWithNoClose(varTitle, Msg, 120, 700);

                    // Préparation des objets iObeya et RIDA à "CRUDer"
                    if (l_connectedPtf.synclist.length) { // on ne synchronise que s'il la plateforme à des éléments à synchroniser.
                        prepareSyncElements(l_connectedPtf);
                        if (g_notificationID)
                            g_notificationID.close(SP.UI.DialogResult.OK);
                        var Msg = g_versionscript + "Execution des requêtes de synchro vers iObeya :" + l_connectedPtf.IOBEYAURL;
                        g_notificationID = SP.UI.ModalDialog.showWaitScreenWithNoClose(varTitle, Msg, 120, 700);
                    }

                    // Maintenant que les éléments sont préparés on execute les requêtes REST vers iObeya
                    if (l_connectedPtf.nodesToTrash.length > 0) {
                        createiObeyaNodeInTrash(l_connectedPtf, l_connectedPtf.nodesToTrash);
                        for (var ii in iObeyaConnectedPlatform.nodesToTrash)
                            updateRollListToRefesh(iObeyaConnectedPlatform, iObeyaConnectedPlatform.nodesToTrash[ii]);
                    }
                    if (l_connectedPtf.nodesToUpdate.length > 0) {
                        PostiObeyaNodes(l_connectedPtf, l_connectedPtf.nodesToUpdate);
                        for (var ii in iObeyaConnectedPlatform.nodesToUpdate)
                            updateRollListToRefesh(iObeyaConnectedPlatform, iObeyaConnectedPlatform.nodesToUpdate[ii]);
                    }
                    if (l_connectedPtf.nodesToCreate.length > 0) {
                        PostiObeyaNodes(l_connectedPtf, l_connectedPtf.nodesToCreate); // TODO: post vs put
                        for (var ii in iObeyaConnectedPlatform.nodesToCreate)
                            updateRollListToRefesh(iObeyaConnectedPlatform, iObeyaConnectedPlatform.nodesToCreate[ii]);
                    }

                    // on corrige un bogue de la plateforme, il faut rafraichir tous les rolls où ils y a des objects modifiés.
                    if (l_connectedPtf.rollsToRefresh.length > 0) {
                        //PostiObeyaNodes(l_connectedPtf, l_connectedPtf.rollsToRefresh);
                    }

                    if (g_notificationID)
                        g_notificationID.close(SP.UI.DialogResult.OK);
                    var Msg = g_versionscript + "Lancement des commits Sharepoint & iObeya";
                    g_notificationID = SP.UI.ModalDialog.showWaitScreenWithNoClose(varTitle, Msg, 120, 700);

                }
            }
        }

        // function de gestion des actions post-synchro, on ne revient pas de cette fonction
        Commit_Plateforms(iObeyaConnectedPlatform);

    } catch (e) {
        throw e; // on propage le throw au dessus.
    }
}

/*
 * 
 * A cette instant, l'ensemble des requetes REST iObeya ont été envoyée ( mais pas encore traitée car asynchrones)
 * Et l'ensemble des requêtes CAML pour Sharepoint ont été préparée et sont attachées au "contexte"
 * Gestion de la première passe, il faut : 
 * - "Commiter" les 2 plateformes.
 * - coté iObeya : cela permet de valider les modifications et aussi de notifier les clients qui feront un refresh
 * - coté Sharepoint : cela permet d'exécuter la requête CAML
 * 
 * Gestion de la seconde passe :
 * reloader le sharepoint après les modifications. ( obtention des nouveaux indexs suite à la création des entrées RIDA)
 * mener les modifications          
 
 * @param {type} iObeyaConnectedPlatform
 * @returns {undefined}
 */

function Commit_Plateforms(iObeyaConnectedPlatform) {

    iObeyaConnectedPlatform.iObeyaToCommit = true; // flag pour la logique
    iObeyaConnectedPlatform.SharepointToCommit = 4; // flag pour la logique

    // Step #2  on lance le commit sharepoint ( asynchrone )
    console.log("Déclenchement du Commit SharePoint");

    iObeyaConnectedPlatform.clientContext.executeQueryAsync(Function.createDelegate(this, function () {
        SharePointCommitQuerySucceeded(iObeyaConnectedPlatform);
    }), Function.createDelegate(this, this.onQueryFailed_test));

    // on lance le timer d'attente

    var timerIdsharepointcommit = window.setInterval(function (iobcptf) {
        // note: la fonction timer s'exécute hors du contexte de la fonction actuelle,
        // il faut lui passer le context iobcptf pour pouvoir disposer des variables nécessaires
        // on attend que toute les requêtes CRUD iObeya soient passées, on déclenche le commit iObeya
        // Step #2 On lance un timer asychrone qui attend que tous les threads "iObeya" soient terminées, pour lancer le "Commit" iObeya puis le commit Sharepoint

        if (iobcptf.requestQueue.length === 0 && iobcptf.iObeyaToCommit === true) {  // attente que les threads soient terminés
            console.log("Lancement du Commit iObeya");
            commitiObeyaChanges(iobcptf);
            iobcptf.iObeyaToCommit = false;
        }

        //On lance un timer asychrone qui attend que tous les threads "iObeya" soient terminées, pour lancer le "Commit" iObeya puis le commit Sharepoint
        // si le commit iobeya a été effectué, maintenant on déclenche le commit sharepoint
        if (iobcptf.requestQueue.length === 0 && iobcptf.iObeyaToCommit == false && iobcptf.SharepointToCommit == 0) {  // attente

            console.log(iobcptf.clientContext); // Contrôle de l'état de la session SharePoint

            if (g_notificationID)
                g_notificationID.close(SP.UI.DialogResult.OK);
            var Msg = g_versionscript + "Ensemble des post-traitements finalisés";
            g_notificationID = SP.UI.ModalDialog.showWaitScreenWithNoClose(varTitle, Msg, 120, 700);

            syncCompleted(iobcptf);
            clearInterval(timerIdsharepointcommit);
        }
    }, 500, iObeyaConnectedPlatform);

}

// une fonction qui affiche que le processus est terminé et affiche les statistiques

function syncCompleted(iObeyaConnectedPlatform) {

    console.log("Update RIDA : success");	// Trace
    var stats = getStats(iObeyaConnectedPlatform.synclist);
    var statsMessage = "- Sens RIDA > iObeya: \n\n"
            + stats[syncType.todo_createiObeya] + " Note(s) créée(s) \n"
            + stats[syncType.todo_synciObeya] + " Note(s) synchronisée(s) \n"
            + stats[syncType.todo_removeiObeya] + " Note(s) à la corbeille \n"
            + stats[syncType.todo_moveBoardiObeya] + " Note(s) changée(s) de panneau\n\n"
            + "- Send iObeya > RIDA : \n\n"
            + stats[syncType.todo_createRida] + " Tâche(s) créée(s)\n"
            + stats[syncType.todo_syncRida] + " Tâche(s) synchronisée(s)\n"
            + stats[syncType.todo_removeRida] + " Tâche(s) désactivée(s)\n\n"
            + "- Sens iObeya > iObeya : \n\n"
            + stats[syncType.todo_cloneiObeya] + " Tâche(s) clonée(s)\n\n"
            + "- Erreurs : \n\n"
            + iObeyaConnectedPlatform.syncErrors
            + " erreur(s) de synchronisation "; // TODO à passer à SyncErrors

    // Rafraîchissement retour à la page
    alert("La synchronisation a été effectuée, statistiques \n\n" + statsMessage);
    ErrorLogingReloadPage("Synchronisation terminée"); // on se sert de cette fonction pour sortir et rafraichir la page
}

// gestion des sémaphores entre threads
function SharePointCommitQuerySucceeded(iObeyaConnectedPlatform) {
    console.log("SharePointCommitQuerySucceeded");	// Trace
    iObeyaConnectedPlatform.SharepointToCommit = 3; // flag pour la logique

    if (g_notificationID)
        g_notificationID.close(SP.UI.DialogResult.OK);
    var Msg = g_versionscript + "Lancement post-traitement (reload Sharepoint)";
    g_notificationID = SP.UI.ModalDialog.showWaitScreenWithNoClose(varTitle, Msg, 120, 700);

    // log des actions
    //CAMLUpdateSyncLogList(iObeyaConnectedPlatform);  // On construit la requete pour faire la mise à jour de liste sharepoint logsyncActions

    // On prepare la fonction de complétion post reload de la liste sharepoint
    iObeyaConnectedPlatform.succesMethods = function () {
        SharePointReloaded(iObeyaConnectedPlatform);
    };

    // On lance le rechargement de la liste sharepoint
//    retrieveRidaListItems(iObeyaConnectedPlatform);
    syncCompleted(iObeyaConnectedPlatform); // TODO:TEST TEST TEST TEST

}


/*
 * Fonction qui est appelée après le reload Sharepoint
 * Elle permet de mener des (posts) traitement, 
 * typiquement traiter des items rida après leur création pour avoir leur iD Sharepoint
 * ex: lien entre nouvelles tâches créés coté iObeya, ou mise à jour des dates ( TODO: vérifier ce dernier point) 
 * @param {type} iObeyaConnectedPlatform
 * @returns {undefined}
 */
function SharePointReloaded(iObeyaConnectedPlatform) {
    console.log("SharePointReloaded");	// Trace
    iObeyaConnectedPlatform.SharepointToCommit = 2; // flag pour la logique

    if (g_notificationID)
        g_notificationID.close(SP.UI.DialogResult.OK);
    var Msg = g_versionscript + "Post-traitement liens de dépendance entre les éléments";
    g_notificationID = SP.UI.ModalDialog.showWaitScreenWithNoClose(varTitle, Msg, 120, 700);

// TODO : ici on relance la mise à jour des predecessors ( lien entre les tâches )


// on indique au timer d'attente que l'on a terminé le post-traitement
    iObeyaConnectedPlatform.SharepointToCommit = 0; // flag pour la logique

}

/*
 fonction qui scrute le contenu de la synclist
 et regarde s'il faut se connecter à d'autres plateformes.
 Si d'autres plateformes sont nécessaires, la fonction lance la connection à celles-ci
 et déplace les actions synclist dans leurs queues de travail.
 
 Puis ensuite lance l'execution des actions create, update, delete, plateforme par plateforme.
 Pour l'instant dans le cadre d'une escallade la note est juste créée, ni synchronisée, ni effacée.
 
 TODO: tester les fonctions au cas où il y ait un besoin dans le futur.
 
 Comme les connexions sont asynchrones, il faut une fonction timer qui attend.
 
 TODO : bien gérer les codes d'erreurs de connexion à la plateforme.
 
 */

/*
 *
 * @param {type} iObeyaConnectedPlatform
 * @returns {undefined}
 *
 */

function ConnectAlliObeyaPlatforms(iObeyaConnectedPlatform) {

    iObeyaConnectedPlatform.countNewPlatformtoConnect = 0; // init de la variable

    // Identification des nouvelles plateformes à connecter

    for (var syncelementid in iObeyaConnectedPlatform.synclist) {
        syncelement = iObeyaConnectedPlatform.synclist[syncelementid];

        if (syncelement.hasOwnProperty("target_url")) { // l'objet identifie-t-il une plateforme potentiellent autre que la principale ?
            // Target_url définie dans l'object de sync list => oui potentiellement une nouvelle plateforme
            // il faut vérifier si cette plateforme est dans l'array et si connecté à cette plateforme

            var parent = iObeyaConnectedPlatform.parent;

            // On regarde si l'entrée de la plateforme demandée existe déjà dans le contexte
            if (!parent.hasOwnProperty(parent[syncelement.target_url])) {
                // Non ,n'existe pas => Création d'une nouvelle entité dans l'array.
                parent[syncelement.target_url] = createConnectionElement(iObeyaConnectedPlatform, syncelement);

                // on place maintenant les callback pour la fonction de connexion.
                parent[syncelement.target_url].succesMethods = function () {
                    console.log("Callback sucess : ConnectAlliObeyaPlatforms, connect ok... url : " + syncelement.target_url);
                    iObeyaConnectedPlatform.countBoardtoload--; // TODO : vérifier que cela passe bien le contexte de la plateforme principale...
                };
                parent[syncelement.target_url].failedMethods = function () {
                    console.log("Callback ERROR : ConnectAlliObeyaPlatforms, connect failed... url : " + syncelement.target_url);
                    iObeyaConnectedPlatform.countBoardtoload--; // TODO : vérifier que cela passe bien le contexte de la plateforme principale...
                };
            }
            // si une plateforme n'est pas connectée ou déjà identifiée, on incrémente le compteur de connexion
            if (parent[target_url].connected == false) { // non connectée et non déja demandée pour connection
                iObeyaConnectedPlatform.countNewPlatformtoConnect++; // on indique qu'il y aura de nouvelles plateformes à connecter.
                parent[target_url].connected = -1;
            }

            // Ensuite on bascule le syncElement vers la l'array synclist de la plateforme cible
            if (!parent[syncelement.target_url].synclist instanceof Array) // si mal/pas initialisé
                parent[syncelement.target_url].synclist = [];

            parent[syncelement.target_url].synclist.push(syncelement); 	// on copie l'élément dans la destination
            iObeyaConnectedPlatform.synclist.splice(syncelementid, 1); 	//on supprime l'élément de la liste source

        }
    }

    // Lancement des connexions vers les nouvelles plateformes


    if (iObeyaConnectedPlatform.countNewPlatformtoConnect > 0) {

        debugger; // !!!!!
        // TODO: iObeyaConnectedPlatform.parent.forEach(function (elmnt) { ne marche pas forcément

        iObeyaConnectedPlatform.parent.forEach(function (elmnt) { // nouvelles connexions à lancer ?
            if (elmnt instanceof Array) { // attention il pourrait y avoir d'autres variables / objets....
                if (elmnt.hasOwnProperty("IOBEYAURL")) { // et si l'url est initialisée..
                    if (elmnt.connected === -1) // on ne traite que celle qui sont flagguées
                        iObeyaPlatformLoginAndGetItems(elmnt);  //connexion vers la nouvelle plateforme, les callbacks seront appelés... asynchrone.
                }
            }
        });
    }
}

/*
 * createConnectionElement( iObeyaConnectedPlatform, syncElement)
 * fonction qui créé une nouvelle structure "entrée de connexion" dans l'array parente.
 *
 * @param {type} iObeyaConnectedPlatform
 * @param {type} syncElement
 * @returns {Array|createConnectionElement.connectNewElement}
 *
 */

function createConnectionElement(iObeyaConnectedPlatform, syncElement) {

    var connectNewElement = []; // nouvel array
    InitiateiObeyaWorkingContextVariables(connectNewElement); // on initialise les valeurs génériques par défaut

    // clonage des valeurs par défault
    connectNewElement.parent = iObeyaConnectedPlatform.parent;
    connectNewElement.IOBEYAURL = iObeyaConnectedPlatform.IOBEYAURL;
    connectNewElement.ROOM_NAME = iObeyaConnectedPlatform.ROOM_NAME;
    connectNewElement.PERCENTAGE_IOBEYASTICKER_MAPPING = iObeyaConnectedPlatform.PERCENTAGE_IOBEYASTICKER_MAPPING;
    connectNewElement.PRIORITY_IOBEYASTICKER_MAPPING = iObeyaConnectedPlatform.PRIORITY_IOBEYASTICKER_MAPPING;
    connectNewElement.ESCALLATION_MAPPING = iObeyaConnectedPlatform.ESCALLATION_MAPPING;
    connectNewElement.DROP_ZONE = iObeyaConnectedPlatform.DROP_ZONE;

    // récuperation des éléments de l'objet de synchronisation
    if (syncElement.target_url)
        connectNewElement.IOBEYAURL = syncElement.target_url;
    if (syncElement.target_room)
        connectNewElement.ROOM_NAME = syncElement.target_room;
    if (syncElement.target_dropZone)
        connectNewElement.DROP_ZONE = syncElement.target_dropZone;

    return connectNewElement;
}

function InitiateiObeyaWorkingContextVariables(createConnectionElement) {

    // Pour info, le contexte est un element d'une variable parent, avec notamment les propriétés suivantes.
    /*
     parent.[IOBEYAURL] ;  // l'array de contexte de plateforme
     parent.defaultUrl = IOBEYAURL; l'url de la plateforme par défaut
     */

    // Variables d'environnement
    /* 	Non initialisée ici, mais décrite pour info, elles doivent être initalisées selon le contexte de la plateforme
     et les besoins de synchronisation.
     Pour la plateforme principale ces infos sont récupérés du fichier interfaceConfig via la fonction loadSyncConf(syncID) au début du code.
     x.syncID = syncID;	// sert pour garder le paramètre d'appel de la synchronisation, typiquement la liste SP à synchroniser
     x.IOBEYAURL = IOBEYAURL; // url de la plateforme
     x.ROOM_NAME = ROOM_NAME; // nom de la ROOM attendue
     x.PERCENTAGE_IOBEYASTICKER_MAPPING = []; // la liste de mapping des objets sticker du dock iObeya
     x.PRIORITY_IOBEYASTICKER_MAPPING = []; // la liste de mapping des objets sticker du dock iObeya
     x.ESCALLATION_MAPPING = []; // idem, pour les objets indiquant une escallade
     x.DROP_ZONE = "DropZone"; // par défaut. ( doit être personnalisé selon le panneau de destination )
     */

    createConnectionElement.BOARDSTOSYNC = []; // la liste des boards à synchroniser demandées.

    // Working connexion
    createConnectionElement.connected = false; // flag = true si connecté à la plateforme
    createConnectionElement.connection_message = ""; // le resultat de la dernière requête http. TODO : évaluer si l'on ne ferait pas un log des connections / résultat pour le deboggage... ?
    //NOTE: false = appel depuis un navigateur / true : appel type jsnode type google plateforme asynchrone stateless. (non implémenté pour l'instant)
    createConnectionElement.JsNodeXMLCalls = false;
    createConnectionElement.cookie = null; // utilisé pour stoker les cookies si jsnode
    createConnectionElement.user = null;  // nom de l'utisateur iObeya connecté
    createConnectionElement.clientId = 0; // iobeya
    createConnectionElement.client_version = 0; // version du client, sert pour calculer des URLs

    // les Rooms / Boards iObeyas
    createConnectionElement.rooms = null; // ensembles des rooms d'une plateforme
    createConnectionElement.activeRoom = null; // celle que l'on utilser
    createConnectionElement.roomallboards = null; // tous les boards de la room
    createConnectionElement.boards = null; // uniquement les boards qui doivent être synchronisés
    createConnectionElement.defaultboard_index = null; // la board courante. ( sert pour certain appel ), TODO : à faire disparaitre ?

    // Données (noeuds/nodes) des plateformes, répliquées en mémoire
    createConnectionElement.iObeyaNodes = []; // les noeuds iObeya de la plateforme (sur les boards à synchronisé seulement )
    createConnectionElement.ridaNodes = []; // sur l'instant principal, la listes des éléments issus du référentiel (iobeya, autre)
    createConnectionElement.synclist = []; // liste des actions de synchronisations ( CRUD )

    // Arrays pour des actions CRUD à mener lors de la synchronisation
    createConnectionElement.nodesToCreate = [];
    createConnectionElement.nodesToUpdate = [];
    createConnectionElement.nodesToTrash = [];
    // pour corriger un bogue en 3.1 ou les elements disparaissaits derriere les roll, TODO : évaluer si toujours nécessaire dans v3.3>
    createConnectionElement.rollsToRefresh = [];

    // Autres variables utilisées lors de la synchronisation
    createConnectionElement.requestQueue = [];	// queue des requêtes iObeya à traiter (asynchrones)
    createConnectionElement.syncErrors = 0; // les erreurs de

    // Note: d'autres variables peuvent être nécessaire, elles sont initialisées au fur et mesure du besoin
    // comme dans les fonctions d'attentes... ( mettre ici pour mémoire les variables utilisées pour faciliter la documentation )
    // x.countNewPlatformtoConnect
    // x.countBoardtoload

}

/***
 Fonction qui scrute la liste et lance les connections vers les plateformes cibles si elles se sont pas connectées
 Note : l'ensemble des plateformes devront avoir le CORS (cross origin ressource sharing) correctement configuré
 *
 * @param {type} iObeyaConnectedPlatform
 * @param {type} callbackfonction
 * @returns {undefined} */

function WaitAlliObeyaPlatformsConnected(iObeyaConnectedPlatform, callbackfonction) {
    console.log("entering timered function for waiting  : WaitAlliObeyaPlatformsConnected, with awaiting queue ="
            + iObeyaConnectedPlatform.countNewPlatformtoConnect
            );
    var directcallback = true;
    if (iObeyaConnectedPlatform.hasOwnProperty("countNewPlatformtoConnect"))
        if (iObeyaConnectedPlatform.countNewPlatformtoConnect) {
            // s'il y a des connexions à attendre...
            directcallback = false;
            var timerId = window.setInterval(function (iObcotf, callbckf) { // TODO : verifier que les 2 variables sont passées...
                if (!iObcotf.countNewPlatformtoConnect) {  // >0 tant que tous les panneaux n'ont pas été lu...
                    // on lance ici la fonctionne de synchro
                    clearInterval(timerId);
                    console.log("WaitAlliObeyaPlatformsConnected complete !");
                    if (callbckf)
                        callCallbackFunctions(callbckf);
                }
            }, 500, iObeyaConnectedPlatform, callbackfonction); // on check toute les 1/2 secondes
        }
    // appel direct du callback ?
    if (directcallback && callbackfonction)
        callCallbackFunctions(callbackfonction);
}

/***
 Crée la liste des objets à synchroniser et retourne l'objet (ne place pas le resultat dans la liste.)
 La businesss logic :
 - loop sur les éléments issu du RIDA (ex: liste sharepoint)
 - loop sur les élements iObeya
 En entrée : la liste des noeux Rida et la liste des noeuds iObeyas précisé dans le contexte.
 
 ne réalise pas les actions CRUD de synchronisation
 ***/

/*
 *
 * @param {type} iObeyaConnectedPlatform
 * @returns {Array}
 */

function compareforSyncAction(iObeyaConnectedPlatform) {
    var l_synclist = [];
    var iObeyaObject;
    var ridaObject;
    var syncObject;
    var nodesRida = iObeyaConnectedPlatform.ridaNodes;
    var iObeyaNodes = iObeyaConnectedPlatform.iObeyaNodes;
    var duedateautoupdate = true;
    var duedateupdated = false;

    try {
        // Première boucle
        // Parcours RIDA pour comparaison avec l'état actuel de iObeya

        for (var inRida = 0; inRida < nodesRida.length; inRida++) { // boucle éléments du rida
            syncObject = null;
            ridaObject = nodesRida[inRida];
            iObeyaObject = getiObeyaObjectById(iObeyaNodes, ridaObject.idiObeya); // on tente de récuperer le noeud iObeya correspondant

            // détermination si le paramètre de configration autoupdate de la date de destination est actif
            //   par défaut == oui (même si la clé est absente)

            if (AUTOUPDATE_DUEDATE !== undefined && AUTOUPDATE_DUEDATE !== null) {
                if (AUTOUPDATE_DUEDATE === "false") {
                    duedateautoupdate = false;
                }
            }

            // On vérifie si les données clés sont présentes...
            if (!ridaObject.hasOwnProperty("synchroiObeya"))
                throw new InterfaceException("Le champ \"synchroiObeya\" ne figure pas dans la liste des champs RIDA à synchroniser.");
            if (!ridaObject.hasOwnProperty("idiObeya"))
                throw new InterfaceException("Le champ \"idiObeya\" ne figure pas dans la liste des champs RIDA à synchroniser.");

            if (!iObeyaObject) { // le noeud iObeya n'existe pas.
                if (ridaObject.synchroiObeya === true && ridaObject.status !== DELETED_STATUS) { // rida demande synchro et statut non desactivé ?
                    if (!ridaObject.idiObeya || ridaObject.idiObeya === "") { // il y a eu une synchro réalisée (donnée id présente)
                        // non jamais synchronisé / vide => Cas n°1 : création d'un nouveau post-it dans iObeya
                        l_synclist = addSyncObject(l_synclist, syncType.todo_createiObeya, ridaObject.idRida, -1, status_todo);
                    } else {
                        // déjà synchronisé / pas vide =>  Cas n°2 : on désynchronise de la tâche RIDA (vider l'ID et enlever le flag)
                        l_synclist = addSyncObject(l_synclist, syncType.todo_removeRida, ridaObject.idRida, -1, status_todo);
                    }
                }
            } else {


                // Le noeud iObeya existe. On compare maintenant les date de modif.
                // Attention dans iObeya il faut regarder l'ensemble des elements note + objets superposés.
                // TODO : il faut tenir compte s'il y a des notes cascadées/liées.
                // on convertit en nombre

                var noteModificationDate = getNoteLastModificationDate(iObeyaObject, iObeyaNodes);

                // Bloc de code commenté car il suffit de boucler sur l'une des liste (dans ce cas, celle d'iObeya) pour que l'autre se mette à jour (après synchronisation).
                // On commence par regarder  s'il faut réajuster la dueDate du coté RIDA ?
                //  c'est une fonctionnalité désactivable, qui permet sans action de l'utilisateur que la date cible n'est pas dans le passé
                /*
                 if (duedateautoupdate && ( ridaObject.dueDate != null )) { // auto ajust dueDate demandé  et la valeur est un nombre
                 if (   parseInt(ridaObject.dueDate) > 10000 &&
                 parseInt(ridaObject.dueDate) < Math.round(new Date().getTime())
                 ) { // si la due date est < date du jour on réajuste
                 console.log("Duedate :  < date du jour ( RIDA) ");
                 //maintenant on s'assure que le Rida sera mis à jour.
                 // on vérifie que l'entrée iObeya n'est pas plus récente (date modif), si +recente on ne fait rien
                 // si c'est le cas on "force" la mise à jour" du RIDA.
                 if (parseInt(ridaObject.modificationDate) >= noteModificationDate ) {
                 console.log("Duedate : réajustée automatiquement à la date du jour (node Rida)");
                 duedateupdated = true;
                 ridaObject.dueDate = Math.round(new Date().getTime());
                 ridaObject.modificationDate = Math.round(new Date().getTime()); // En forcant la date de modif > on s'assure que l'objet iObeya (et ensuite le rida) seront mis à jour
                 }
                 }
                 }*/

                // On vérifie également s'il faut réajuster la dueDate du coté object iObeya ?
                // Comme le mapping des champs est souple, il faut vérifier que la propriété 'duedate' est bien utilisée dans cette note iObeya
                if (duedateautoupdate) {
                    for (var ii in IOBEYANOTE_MAPPING) { // on loop dans le IOBEYANOTE_MAPPING

                        if (IOBEYANOTE_MAPPING[ii].class !== iObeyaObject['@class']) // on filtre sur le type d'objet
                            continue;

                        if (IOBEYANOTE_MAPPING[ii].rida_field === 'dueDate') { // dueDate est mappé / existe ?
                            var iObeyaDueDateProperty; // "réference de la propriété javascript.
                            // on récupère la "reference" de la propriété DueDATE dans la note iObeya
                            if (IOBEYANOTE_MAPPING[ii].hasOwnProperty("iobeya_parent"))
                                iObeyaDueDateProperty = iObeyaObject[ IOBEYANOTE_MAPPING[ii]["iobeya_parent"] ][ii]; // utilise un object/array intermédiaire
                            else
                                iObeyaDueDateProperty = iObeyaObject[ii]; //propriété en accès directe

                            //Maintenant on s'assure que l'entrée iObeya sera mise à jour, seulement si date de mise à jour
                            if (iObeyaDueDateProperty instanceof String || !isNaN(iObeyaDueDateProperty)) {
                                // on effectue les conversions de format selon le type d'entrée
                                if (iObeyaDueDateProperty instanceof String)
                                    iObeyaDueDatePropertyval = Date.parse(reverseDate(iObeyaDueDateProperty));
                                else
                                    iObeyaDueDatePropertyval = iObeyaDueDateProperty;

                                if (iObeyaDueDatePropertyval < Math.round(new Date().getTime())) { // on compare les date
                                    console.log("Duedate :  < date du jour ( RIDA) ");

                                    if (noteModificationDate > (ridaObject.modificationDate)) { // seulement si normalement l'iObeya devait être mis à jour    
                                        iObeyaDueDatePropertyval = Math.round(new Date().getTime()); // on met à jour la date
                                        console.log("Duedate : réajustée automatiquement à la date du jour (node iObeya)");
                                        duedateupdated = true;

                                        if (iObeyaDueDateProperty instanceof String) // si originellement la valeur était un string on reconverti la valeur en string
                                            iObeyaDueDatePropertyval = prettyDate(new Date(noteModificationDate));

                                        // on place la valeur dans le champs
                                        if (IOBEYANOTE_MAPPING[ii].hasOwnProperty("iobeya_parent"))
                                            iObeyaObject[ IOBEYANOTE_MAPPING[ii]["iobeya_parent"] ][ii] = iObeyaDueDatePropertyval; // utilise un object/array intermédiaire
                                        else
                                            iObeyaObject[ii] = iObeyaDueDatePropertyval; //propriété en accès directe

                                        iObeyaObject.toreupdate = true; // on force la remise à jour de la note avec la nouvelle donnée.
                                    }
                                } //if ( iObeyaDueDateProperty <
                            } //if ( iObeyaDueDateProperty instanceof String || !isNaN(iObeyaDueDateProperty) )
                        } // if (IOBEYANOTE_MAPPING[ii].rida_field === 'dueDate') {
                    } // for
                } // if (duedateautoupdate)

                // On fait les comparaisons de dates
                // important :  faut tenir compte d'une TOLERANCEINTERVAL, car la synchronisation des serveurs peut ne pas être parfaite + latence internet.

                // code pour déboggage sur les dates.
                console.log(" comparaison de date rida, titre : " + ridaObject.subject + " Rida date" + (ridaObject.modificationDate).toString() + " /" + new Date(ridaObject.modificationDate) + " iObeya note+overlay obj date:" + (noteModificationDate).toString() + " /" + new Date(noteModificationDate) + " diff Abs : " + ((ridaObject.modificationDate) - noteModificationDate).toString() + "Intervalle de tolérance:" + TOLERANCEINTERVAL);

                if (
                        ridaObject.synchroiObeya && ridaObject.status != DELETED_STATUS &&
                        Math.abs(ridaObject.modificationDate - noteModificationDate) > TOLERANCEINTERVAL
                        ) {

                    if ((ridaObject.modificationDate) > noteModificationDate) {
                        console.log("ridaObject.modificationDate > noteModificationDate :" + ((ridaObject.modificationDate) > noteModificationDate));
                        // Rida plus récent > Cas n°3 : mise à jour iObeya
                        l_synclist = addSyncObject(l_synclist, syncType.todo_synciObeya, ridaObject.idRida, iObeyaObject.id, status_todo);
                        l_synclist[l_synclist.length - 1].duedateupdated = duedateupdated;
                        // note : l'entrée Rida sera mise à jour après l'update iObeya automatiquement.
                    } else {
                        console.log(" ridaObject.modificationDate <= noteModificationDate");
                        // noeud iObeya plus récent > rida >> Cas n°4 : mise à jour RIDA
                        // on vérifie si la duedate d'iObeya doit être mise à jour avant de faire la synchro
                        l_synclist = addSyncObject(l_synclist, syncType.todo_syncRida, ridaObject.idRida, iObeyaObject.id, status_todo);
                        l_synclist[l_synclist.length - 1].duedateupdated = duedateupdated;
                    }
                } else if (ridaObject.status === DELETED_STATUS || !ridaObject.synchroiObeya) {
                    // Objet iobeya existe, mais plus dans la liste RIDA ou effacé >  Cas n°5 : passage du post-it en corbeille (on n'efface rien, au cas où)
                    l_synclist = addSyncObject(l_synclist, syncType.todo_removeiObeya, ridaObject.idRida, iObeyaObject.id, status_todo);
                }
            }
        } // for (var inRida ...)

        /*
         2ème boucle... parcours de l'array iObeya en mémoire,
         Traitement des éléments iObeya qui diffèrent, les cas suivants sont traités :
         - création d'une nouvelle entrée RIDAv
         - déplacement d'une note dans un autre tableau ( via le RIDA )
         - Clone d'une note pour faire une escallade vers un autre panneau (escalade de note)
         */

        for (var iniObeya = 0; iniObeya < iObeyaNodes.length; iniObeya++) {
            iObeyaObject = iObeyaNodes[iniObeya]; // on tente de trouver le noeud Rida correspondant

            if (// note(s) ou card
                    iObeyaObject['@class'] === "com.iobeya.dto.BoardNoteDTO" ||
                    iObeyaObject['@class'] === "com.iobeya.dto.BoardCardDTO"
                    ) {
                syncObject = null;
                ridaObject = getRidaObjectByiObeyaId(nodesRida, iObeyaObject.id);
                // Cas n°6 : clône de notes ? (présence d'un sticker spécial)
                if (needEscallation(iObeyaObject, iObeyaNodes))
                    l_synclist = addSyncObject(l_synclist, syncType.todo_cloneiObeya, -1, iObeyaObject.id, status_todo);
                // Cas n°7 : création de tâche dans RIDA. ( noeud absent du Rida)
                if (!ridaObject) {
                    l_synclist = addSyncObject(l_synclist, syncType.todo_createRida, -1, iObeyaObject.id, status_todo);
                    l_synclist[l_synclist.length - 1].boardchanged = true;
                } else {
                    // le rida existe ( les autres cas de synchro ont été gérés dans la boucle #1)
                    // 	Cas n°9 : déplacement de panneau, la board à changer dans le rida
                    if (ridaObject.PanneauiObeya.toLowerCase() !== iObeyaObject.boardname.toLowerCase()) { // on fait la comparaison case insensitive...
                        var found = false;
                        for (var loop in l_synclist) {
                            // on regarde si l'idiObeya n'est pas déjà dans la synclist (cela devrait être le cas...)
                            if (l_synclist[loop].idRida === ridaObject.idRida) {
                                // oui, on le flag juste pour deplacement de panneau
                                l_synclist[loop].action = syncType.todo_moveBoardiObeya;
                                found = true;
                                console.log("Déplacement de panneau trouvé : on change l'action de synchro");
                            }
                        }
                        // L'objet n'a pas été trouvé dans la liste, on l'ajoute pour supression supprime (ce code ne devrait jamais être activé...)
                        if (!found) {
                            // On crée un nouvel objet dans la liste
                            l_synclist = addSyncObject(l_synclist, syncType.todo_moveBoardiObeya, ridaObject.idRida, iObeyaObject.id, status_todo);
                            console.log("Etrange : l'objet iObeyaObject n'a pas été trouvé dans l_synclist, ajout d'une entrée");
                        }
                    } // if ( ridaObject.PanneauiObeya.toLowerCase() != iObeyaObject.boardname.toLowerCase() )
                } // else if (ridaObject == null)
            } // c'est une note if (iObeyaObject['@class'] === "com.iobeya.dto.BoardNoteDTO" || iObeyaObject['@class'] === "com.iobeya.dto.BoardCardDTO" )
        } // loop array d'objets iObeya

        // A cette étape la liste des CRUD de synchronisations est complète.

        return l_synclist;
    } catch (e) {
        catchAllThrow(e, iObeyaConnectedPlatform);
        return null;
    }
    return null;
}

/*** Routage des différents modes de synchronisation possibles ***/
//TODO: evaluer l'opportunité de placer des fonctions qui font une "post-synchro" des objects à l'issus de la première passe de synchro. cf plus bas (ex: si retraitement pendant la synchro)
// cf if( iObeyaObject.toreupdate != undefined ){ empty code.
// idem pour le nom des tableaux RIDA ?

/*
 *
 * @param {type} iObeyaConnectedPlatform
 * @returns {unresolved}
 *
 */

function prepareSyncElements(iObeyaConnectedPlatform) {

    var l_uid = null;
    var result = null;
    var iObeyaToRemove = null;
    var iObeyaObject = null;
    var ridaObject = null;
    var iObeyaOverlapping;
    var syncObject;
    var l_iObObjt;
    var l_syncList = iObeyaConnectedPlatform.synclist;  // on récupère du contexte

    // on reset les arrays suivantes...
    iObeyaConnectedPlatform.nodesToCreate = [];
    iObeyaConnectedPlatform.nodesToUpdate = [];
    iObeyaConnectedPlatform.nodesToTrash = [];
    iObeyaConnectedPlatform.rollsToRefresh = [];
    iObeyaConnectedPlatform.changelogEvents = []; // pour logguer les évènements de changement détecté. => pour ajouter au loglist

    for (var idSync in l_syncList) {
        syncObject = l_syncList[idSync];
        l_syncList[idSync].datestamp = Math.round(new Date().getTime()); // on ajoute le time stamp au sync évent

        if (syncObject.idRida !== -1) {
            ridaObject = getRidaObjectByRidaId(iObeyaConnectedPlatform.ridaNodes, syncObject.idRida);
        }
        iObeyaOverlapping = null;

        if (syncObject.idiObeya !== -1) {
            iObeyaObject = getiObeyaObjectById(iObeyaConnectedPlatform.iObeyaNodes, syncObject.idiObeya);
            iObeyaOverlapping = findOverlappingElements(iObeyaObject, iObeyaConnectedPlatform.iObeyaNodes);
        }

        try {

            switch (syncObject.action) {

                case syncType.todo_cloneiObeya:
                    // Important : Toutes les plateformes sont connectées ici.

                    // Si la note n'a pas déjà été clonnée (linkUrl vide)
                    if (iObeyaObject.hasOwnProperty("linkUrl") && !(iObeyaObject.linkUrl)) {
                        // On commence par placer l'url de la cible dans la note actuelle. TODO: mettre une option dans les préférences ?
                        iObeyaObject.linkUrl = getEscallationTargetBoardUrl(iObeyaConnectedPlatform, iObeyaObject); // on precalcule le lien vers la cible escalladée.
                        iObeyaObject.linkLabel = getEscallationTargetBoardLabel(iObeyaConnectedPlatform, iObeyaObject); // on precalcule le lien vers la cible escalladée.
                        iObeyaConnectedPlatform.nodesToUpdate.push(iObeyaObject); // on marque la note source comme devant être rafraichie.

                        // On créé ensuite une nouvelle note "clonée" vers la destination
                        l_uid = CLONED_NOTE_PREFIX + Math.round(new Date().getTime()) + '.' + Math.floor(Math.random() * 1000000);
                        // les infos de la nouvelle plateforme sont "incluses" dans le noeud lui-même/
                        // TODO: rendre la fonction appellée "pure" en sortant ce calcul à l'extérieur de la fonction ?
                        result = createNoteIniObeya(iObeyaConnectedPlatform, null, l_uid, iObeyaObject);
                        iObeyaConnectedPlatform.nodesToCreate = iObeyaConnectedPlatform.nodesToCreate.concat(result);
                        iObeyaConnectedPlatform.iObeyaNodes = iObeyaConnectedPlatform.iObeyaNodes.concat(result); //ajoute l'objet pour pouvoir calculer correctement le placement suivant 
                        syncObject.status = status_done;

                        // On enrichie la synclist avec les infos pour permettre un log des changements si l'option est activée
                        var tempRidaObject = mapIObeyaToRidaObject(iObeyaObject, iObeyaConnectedPlatform.iObeyaNodes);
                        enrichSyncInfoFromiObeyaObject(iObeyaObject, iObeyaConnectedPlatform.iObeyaNodes, l_syncList[idSync]);
                        syncObject.escallated = true; // on ajoute le time stamp au sync évent
                    }
                    break;

                case syncType.todo_createiObeya :
                    // on calcule l'UID de la nouvelle ressource
                    l_uid = RIDA_CREATED_NOTE_PREFIX + Math.round(new Date().getTime()) +
                            "." + Math.floor(Math.random() * 1000000);
                    l_iObObjt = createNoteIniObeya(iObeyaConnectedPlatform, ridaObject, l_uid);

                    if (l_iObObjt !== null) {
                        iObeyaConnectedPlatform.nodesToCreate = iObeyaConnectedPlatform.nodesToCreate.concat(l_iObObjt);
                        // on met à jour l'entrée "RIDA" avec les informations de la note créée ( ex: id, date, modif, creator )
                        // l_iObObjt[0]  car l_iObObjt est un array de noeud, le premier est toujours la note
                        if (STATUS_CREATED == null)
                            STATUS_CREATED = "C";
                        createCAMLupdateRidaEntry(iObeyaConnectedPlatform, ridaObject.idRida, l_iObObjt[0], STATUS_CREATED + ">iO");// on met à jour l'entrée "RIDA" avec les informations de la note créée ( ex: id, date, modif, creator )
                        syncObject.status = status_done;

                        // on enrichie la synclist
                        enrichSyncInfoFromiObeyaObject(l_iObObjt[0], iObeyaConnectedPlatform.iObeyaNodes, l_syncList[idSync]);
                    } else {
                        result = CAML_DeactivateRidaEntrySynchroFlag(iObeyaConnectedPlatform, syncObject.idRida);
                    }
                    break;

                case syncType.todo_synciObeya :
                    l_iObObjt = updateNoteIniObeya(iObeyaConnectedPlatform, ridaObject, iObeyaObject, iObeyaOverlapping);
                    iObeyaConnectedPlatform.nodesToUpdate = iObeyaConnectedPlatform.nodesToUpdate.concat(l_iObObjt);
                    if (STATUS_SYNC == null)
                        STATUS_SYNC = "S";
                    createCAMLupdateRidaEntry(iObeyaConnectedPlatform, ridaObject.idRida, l_iObObjt[0], STATUS_SYNC + ">iO"); // on met à jour l'entrée "RIDA" avec les informations de la note créée ( ex: id, date, modif, creator )
                    syncObject.status = status_done;

                    // on enrichie la synclist
                    enrichSyncInfoFromiObeyaObject(l_iObObjt[0], iObeyaConnectedPlatform.iObeyaNodes, l_syncList[idSync]);
                    break;

                case syncType.todo_createRida :
                    // Si c'est une note clonée alors on ne la crée pas côté SP
                    if (!iObeyaObject.id.startsWith(CLONED_NOTE_PREFIX)) {
                        if (STATUS_CREATED == null)
                            STATUS_CREATED = "S";
                        result = createCAMLCreateRidaEntry(iObeyaConnectedPlatform, iObeyaObject, STATUS_CREATED + ">Sh"); // construction de la requete CAML Sharepoint.
                        syncObject.status = updateSyncStatus(result); // s'il y a erreur => on flag en erreur
                        // forcer la mise à jour de la note iObeya si retraitement des données charges (ajoute + "/jh xxx" au contenu)
                        // a factoriser avec celui de create rida...

                     if (iObeyaObject.toreupdate != undefined) {
                            iObeyaConnectedPlatform.nodesToUpdate.push(iObeyaObject);
                        }

                        // on enrichie la synclist
                        enrichSyncInfoFromiObeyaObject(iObeyaObject, iObeyaConnectedPlatform.iObeyaNodes, l_syncList[idSync]);
                    }
                    break;

                case syncType.todo_syncRida :

                    // Si c'est une note clonée alors on la synchronise pas côté SP
                    if (!syncObject.idiObeya.startsWith(CLONED_NOTE_PREFIX)) {
                        if (STATUS_SYNC == null)
                            STATUS_SYNC = "S";
                        result = createCAMLupdateRidaEntry(iObeyaConnectedPlatform, syncObject.idRida, iObeyaObject, STATUS_SYNC + ">Sh"); // construction de la requete CAML Sharepoint.
                        syncObject.status = updateSyncStatus(result);
                        // forcer la mise à jour de la note iObeya si retraitement des données charges (ajoute + "/jh xxx" au contenu)
                        // a factoriser avec celui de create rida...
                        
                        if (iObeyaObject.toreupdate != undefined) {
                            iObeyaConnectedPlatform.nodesToUpdate.push(iObeyaObject);
                        }

                        // on enrichie la synclist
                        enrichSyncInfoFromiObeyaObject(iObeyaObject, iObeyaConnectedPlatform.iObeyaNodes, l_syncList[idSync]);
                    }
                    break;

                case syncType.todo_removeiObeya :
                    iObeyaNodesToRemove = [];
                    iObeyaNodesToRemove.push(iObeyaObject);

                    // s'il y a des éléments par dessus la note on les supprimes égalements...
                    if (!iObeyaOverlapping)
                        iObeyaNodesToRemove = iObeyaNodesToRemove.concat(iObeyaOverlapping);

                    // NOTE: Comme l'object est toujours existant (corbeille) on le laisse, pas d'impact sur la suite de l'execution du code.
                    // on place le noeud (note) dans la liste des éléments à supprimer. ( seul les "overlapping elements sont supprimés directement)
                    iObeyaConnectedPlatform.nodesToTrash = iObeyaConnectedPlatform.nodesToTrash.concat(iObeyaNodesToRemove);
                    syncObject.status = status_nil;

                    // on enrichie la synclist
                    enrichSyncInfoFromiObeyaObject(iObeyaObject, iObeyaConnectedPlatform.iObeyaNodes, l_syncList[idSync]);
                    break;

                case syncType.todo_moveBoardiObeya :
                    // On change la note de tableau
                    // 1- on détruit (corbeille) la note existante dans le tableau source

                    iObeyaNodesToRemove = [];
                    iObeyaNodesToRemove.push(iObeyaObject);

                    // on traite les overlappings objects
                    if (!iObeyaOverlapping)
                        iObeyaNodesToRemove = iObeyaNodesToRemove.concat(iObeyaOverlapping);

                    // NOTE: idealement il faudrait supprimer le noeud dans l'array des noeuds iObeya en mémoire
                    // cependant comme l'object est toujours existant (corbeille) on le laisse, pas d'impact sur la suite de l'execution du code.
                    iObeyaConnectedPlatform.nodesToTrash = iObeyaConnectedPlatform.nodesToTrash.concat(iObeyaNodesToRemove);
                    // 2- on créé une nouvelle note dans le tableau de destination (nouvel ID de note)

                    l_uid = "rida_" + Math.round(new Date().getTime()) + "." + Math.floor(Math.random() * 1000000);
                    l_iObObjt = createNoteIniObeya(iObeyaConnectedPlatform, ridaObject, l_uid);
                    iObeyaConnectedPlatform.nodesToCreate = iObeyaConnectedPlatform.nodesToCreate.concat(l_iObObjt);
                    syncObject.status = status_done;

                    // on update the sync object pour permettre un log des actions
                    enrichSyncInfoFromiObeyaObject(l_iObObjt, iObeyaConnectedPlatform.iObeyaNodes, l_syncList[idSync]);
                    syncObject.boardchanged = true; // on ajoute le time stamp au sync évent
                    break;

                case syncType.todo_removeRida : // ce cas de figure ne détruit pas l'entrée, on supprime simplement l'information de synchro (cas ou la note est à la poubelle )
                    result = CAML_DeactivateRidaEntrySynchroFlag(iObeyaConnectedPlatform, syncObject.idRida); // construction de la requete CAML Sharepoint.
                    // on update the sync object pour permettre un log des actions
                    var t_ridaobj = getRidaObjectByRidaId(iObeyaConnectedPlatform.ridaNodes, syncObject.idRida)
                    syncObject.datestamp = Math.round(new Date().getTime()); // on ajoute le time stamp au sync évent
                    syncObject.linkUrl = ""; // le lien vers l'object source sur le panneau
                    syncObject.datecreation = t_ridaobj.creationDate;
                    syncObject.PanneauiObeya = t_ridaobj.PanneauiObeya;
                    syncObject.modificationDate = t_ridaobj.modificationDate;
                    syncObject.status = t_ridaobj.status;
                    syncObject.subject = t_ridaobj.subject;
                    syncObject.dueDate = t_ridaobj.dueDate;
                    syncObject.firmDeadline = t_ridaobj.firmDeadline;
                    syncObject.chantier = t_ridaobj.chantier;
                    syncObject.resteafaire = t_ridaobj.resteafaire;
                    syncObject.priority = t_ridaobj.priority;
                    syncObject.projet = t_ridaobj.projet;
                    syncObject.chantier = t_ridaobj.chantier;
                    syncObject.status = status_nil;
                    break;

                    /**
                     * Code inaccessible -> commenté
                     */
                    // syncObject.actionlabel = g_actionstring[syncObject.action];
                    //CAML_updateRidaSyncInfo(iObeyaConnectedPlatform,syncObject.idRida,g_actionstring[syncObject.action]);

            }
        } catch (e) {
            syncObject.status = status_failed; // TODO: Utile ? sachant que l'execution s'arrête ici avec throw
            throw e;
        }

    } // for (var idSync in l_syncList)

    return l_syncList;
}

/*
 * function qui permet d'enrichir les elements de synchro pour permettre ensuite de créer un log d'action utilisable
 * Utilise la table de correspondante SHAREPOINTLIST_MATCHINGNAME de la liste principale
 * @param {type} iObeyaObject
 * @param {type} iObeyaNodes
 * @param {type} syncElement
 * @returns {undefined}
 */
function enrichSyncInfoFromiObeyaObject(iObeyaObject, iObeyaNodes, syncElement) {

    syncElement.datestamp = Math.round(new Date().getTime()); // on ajoute le time stamp au sync évent
    syncElement.linkUrl = iObeyaObject.linkUrl; // le lien vers l'object source sur le panneau

    var tempRidaObject = mapIObeyaToRidaObject(iObeyaObject, iObeyaNodes);

    syncElement.modificationDate = iObeyaObject.modificationDate;
    syncElement.datecreation = iObeyaObject.creationDate;
    syncElement.PanneauiObeya = iObeyaObject.boardname;
    syncElement.target_url = iObeyaObject.target_url;
    syncElement.roomname = iObeyaObject.roomname;
    syncElement.status = tempRidaObject.status;
    syncElement.subject = tempRidaObject.subject;
    syncElement.dueDate = tempRidaObject.dueDate;
    syncElement.firmDeadline = tempRidaObject.firmDeadline;
    syncElement.chantier = tempRidaObject.chantier;
    syncElement.resteafaire = tempRidaObject.resteafaire;
    syncElement.priority = tempRidaObject.priority;
    syncElement.projet = tempRidaObject.projet;
}

function updateRollListToRefesh(iObeyaConnectedPlatform, iObeyaObject) {
//on regarde si le roll existe dejà dans la liste courante
    var found = -1, roll, statusObject;
    if (isNote(iObeyaObject)) { // pour accélérer on ne traite que les notes / cards ( les stickers etc... sont forcéments sur une note/card )
        statusObject = findNoteStatus(iObeyaObject, iObeyaConnectedPlatform.iObeyaNodes); // on récupère le status et le roll

        for (var ii in iObeyaConnectedPlatform.rollsToRefresh) { // on scanne la liste existante
            if (iObeyaConnectedPlatform.rollsToRefresh[ii].id === statusObject.rollObject.id) {
                found = ii;
                break;
            }
        }

        if (found === -1) {  // on n'a pas trouvé le roll, on l'ajoute à l'array
            iObeyaConnectedPlatform.rollsToRefresh.push(statusObject.rollObject);
        }
    }
}

/*** Mise à jour du statut de l'objet Sync suite à une synchronisation ***/
/*
 *
 * @param {type} result
 * @returns {Number|status_done|status_failed}
 *
 */

function updateSyncStatus(result) {
    if (result)
        return status_failed;
    else
        return status_done;
}

/*** Formatage du statut pour le rendre intelligible ***/
/*
 *
 * @param {type} status
 * @returns {synchro_status_nil|String|synchro_status_done|synchro_status_failed}
 *
 */

function parseStatus(status) {
    if (status == status_done)
        return synchro_status_done;
    if (status == status_failed)
        return synchro_status_failed;
    if (status == status_nil)
        return synchro_status_nil;
}

// Fonction utilitaires à déplacer dans un js idoine
// permet d'appeler les fonctions passées en paramètres les unes après les autres
// array de fonction ou noeud simple
// verifier si les variables de contexte sont bien présentes
/*
 *
 * @param {type} functionArrayOrNode
 * @returns {undefined}
 *
 */

function callCallbackFunctions(functionArrayOrNode) {
    if (functionArrayOrNode instanceof Array) {
        for (var ii in functionArrayOrNode) {
            if (functionArrayOrNode[ii] instanceof Function)
                functionArrayOrNode[ii]();
        }
    } else if (functionArrayOrNode instanceof Function)
        functionArrayOrNode();
}

/*** Récupération des éléments du tableau ***/
// TODO : a retravailler

/***
 
 Fonctions de gestion et manipulation des objets iObeya en mémoire
 Ces fonctions reprennent la structure des objects iObeya véhiculés
 par les Web Interfaces.
 
 Quelques propriétés sont ajoutés pour permettre un debug ou une logique.
 Le WS iObeya ne se pleint pas de recevoir des champs supplémentaires...
 ex: boardid / boardname
 
 *** /
 
 
 
 /*** Création d'un post-it dans iObeya (initialisation) ***/
// TODO: que faire en cas de suppression du sticker lien ?
/*
 *
 * @param {type} iObeyaConnectedPlatform
 * @param {type} ridaObj : l'object rida (null dans le cas d'un clonage)
 * @param {type} uid : l'id cible pour la note
 * @param {type} iObeyaNodeToClone : le noeud à clone ( null dans le cas d'une création à partir d'un object RIDA)
 * @returns {Array|createClonedNote.elementsToCreate|helper.elementsToCreate|{newNote:,roll:string,iObeyaNodes:,elementsToCreate:Array.elementsToCreate} */

function createNoteIniObeya(iObeyaConnectedPlatform, ridaObj, uid, iObeyaNodeToClone) {
    try {
        console.log("Création d'un nouveau post-it dans iObeya");
        var escallationSticker = null;
        var iObeyaOverlapping = null;
        var helper;

        // Initialisation de l'object Notes
        var newNote = {};

        newNote.id = uid;
        newNote.isAnchored = false;
        newNote.isLocked = false;
        newNote.linkLabel = "";
        newNote.props = {};

        // new properties for interface v3.3
        // note: properties "props" is set in fillNoteForiObeya
        newNote.score = -1;
        newNote.scoreRatio = -1;
        newNote.asset = null;
        newNote.fontFamily = "arial";

        newNote.name = "";
        newNote.setName = "";
        newNote.x = 0;
        newNote.y = 0;
        newNote.zOrder = 0;

        if (iObeyaNodeToClone) {
            helper = createClonedNote(newNote, iObeyaConnectedPlatform, iObeyaNodeToClone);
        } else {
            // on détermini quel type d'objet iObeya il faut créer
            newNote['@class'] = "com.iobeya.dto.BoardNoteDTO"; // par default
            // modifié
            // si l'objet RIDA possède une description ou des détails on utilise une card
            if ((ridaObj.description) || (ridaObj.details)) {
                newNote['@class'] = "com.iobeya.dto.BoardCardDTO";
                var typ1 = typeof ridaObj.description;
                var typ2 = typeof ridaObj.details;
            }


            helper = createNoteFromRida(newNote, iObeyaConnectedPlatform, ridaObj);

            // cf. rouleau saturé
            if (helper === null) {
                // retourner null pour pouvoir tester dans la fonction supérieur
                return null;
            }
        }

        newNote = helper.newNote;
        var elementsToCreate = helper.elementsToCreate;

        return elementsToCreate; // retour la liste des éléments à mettre à jour/ créer dans iObeya
    } catch (e) {
        throw e;
    }
}

/**
 * Crée une note à parti de Rida, retourne une structure qui contient les éléments que createNoteIniObeya a besoin
 
 *
 * @param {type} newNote
 * @param {type} iObeyaConnectedPlatform
 * @param {type} ridaObj
 * @returns {createNoteFromRida.creationHelper}
 */

function createNoteFromRida(newNote, iObeyaConnectedPlatform, ridaObj) {

    newNote.color = NOTE_DEFAULT_COLOR;
    newNote.linkUrl = "";
    newNote.linkLabel = "";
    newNote.target_url = iObeyaConnectedPlatform.target_url;

    var l_boardid = getBoardidFromRidaObj(iObeyaConnectedPlatform, ridaObj);  //Permet de récupérer le nom du tableau pour l'objet à créer
    var roll = findRollbyLabelName(iObeyaConnectedPlatform.iObeyaNodes, ridaObj.status, l_boardid); // Zone d'atterrissage

    // on place les valeurs suivante au sein de la note l'id
    // ces deux propriétés ne sont pas standard dans iObeya,
    // mais sont utilisés pour la logique au sein du code
    newNote.boardid = l_boardid;
    newNote.roomid = iObeyaConnectedPlatform.activeRoom.id;
    newNote.boardname = getBoardNameFromRidaObj(iObeyaConnectedPlatform, ridaObj);
    newNote.roomname = iObeyaConnectedPlatform.activeRoom.name;
    newNote.asset = null;

    // Initialisation du container  (la note est rattachée au "containeur" du board)
    newNote.container = getBoardElementContainerFromBoardName(iObeyaConnectedPlatform, ridaObj.PanneauiObeya);

    // Place le contenu "coeur de la note/card" : les x champs visibles
    // note : la fonction pourrait évoluer vers d'autres natures de note
    newNote = fillNoteForiObeya(newNote, ridaObj);

    // Récupérer tous les éléments qui chevauchent le post-it
    // on crée les autres éléments dont on a besoin
    var overlappingElements = findOverlappingElements(newNote, iObeyaConnectedPlatform.iObeyaNodes);
    newNote = placeElement(roll, newNote, iObeyaConnectedPlatform.iObeyaNodes, overlappingElements);

    // Si l'élement n'est pas placé (rouleau saturé)
    if (newNote === null) {
        return null;
    }

    //ajoute l'objet dans la liste en mémoire pour pouvoir calculer correctement le placement des objets suivants
    iObeyaConnectedPlatform.iObeyaNodes.push(newNote);

    // Etiquette du responsable
    var newLabel = null;
    if (ridaObj.hasOwnProperty('actor'))
        if (ridaObj.actor.length > 0) {
            newLabel = createActorLabel(iObeyaConnectedPlatform, ridaObj);
            newLabel = placeLabel(newLabel, newNote);
            iObeyaConnectedPlatform.iObeyaNodes.push(newLabel);
        }

    // Sticker pourcentage achevé
    var newPercentage = null;
    if (ridaObj.percentComplete != null
            && PERCENTAGE_IOBEYASTICKER_MAPPING.map[ridaObj.percentComplete] != null) {
        newPercentage = createSticker(iObeyaConnectedPlatform, ridaObj, ridaObj.percentComplete, PERCENTAGE_IOBEYASTICKER_MAPPING);
        newPercentage = placePercentCompleteSticker(newPercentage, newNote);
        iObeyaConnectedPlatform.iObeyaNodes.push(newPercentage);
    }

    // Sticker priorité
    var newPriority = null;
    if (ridaObj.priority != null
            && PRIORITY_IOBEYASTICKER_MAPPING.map[ridaObj.priority] != null) {
        newPriority = createSticker(iObeyaConnectedPlatform, ridaObj, ridaObj.priority, PRIORITY_IOBEYASTICKER_MAPPING);
        newPriority = placePrioritySticker(newPriority, newNote);
        iObeyaConnectedPlatform.iObeyaNodes.push(newPriority);
    }

    var elementsToCreate = [];
    elementsToCreate.push(newNote);
    if (newLabel != null)
        elementsToCreate.push(newLabel);
    if (newPercentage != null)
        elementsToCreate.push(newPercentage);
    if (newPriority != null)
        elementsToCreate.push(newPriority);

    var creationHelper = {
        newNote: newNote,
        roll: roll,
        nodesiObeya: iObeyaConnectedPlatform.iObeyaNodes,
        elementsToCreate: elementsToCreate
    };
    return creationHelper;
}

/**
 * Clone une note, retourne une structure qui contient les éléments que createNoteIniObeya a besoin
 * @param newNote
 * @param iObeyaNodes
 * @param iObeyaNodeToClone
 * @returns {{newNote: *, roll: string, iObeyaNodes: *, elementsToCreate: Array}}
 */
function createClonedNote(newNote, iObeyaConnectedPlatform, iObeyaNodeToClone) {

    var targetiObeyaConnectedPlatform = iObeyaConnectedPlatform.parent;

    newNote['@class'] = iObeyaNodeToClone['@class'];
    newNote.color = iObeyaNodeToClone.color;
    newNote.height = iObeyaNodeToClone.height;
    newNote.width = iObeyaNodeToClone.width;
    newNote.x = iObeyaNodeToClone.x;
    newNote.y = iObeyaNodeToClone.y;
    newNote.modifier = iObeyaNodeToClone.modifier;
    newNote.modificationDate = Math.round(new Date().getTime());
    iObeyaNodeToClone.modificationDate; // TODO mettre la date de la note source ?
    newNote.linkUrl = getObjectCurrentBoardUrl(iObeyaConnectedPlatform, iObeyaNodeToClone); // les infos de la note actuelle
    newNote.label = getObjectCurrentBoardLabel(iObeyaConnectedPlatform, iObeyaNodeToClone); // les infos de la note actuelle
    newNote.creator = iObeyaNodeToClone.creator;
    newNote.creationDate = iObeyaNodeToClone.creationDate;


    //pour la note
    if (iObeyaNodeToClone['@class'] === "com.iobeya.dto.BoardNoteDTO") {
        newNote.props.content = iObeyaNodeToClone.props.content; // charge en J/H
        newNote.props.title = iObeyaNodeToClone.props.title; // due date
        newNote.props.responsible = iObeyaNodeToClone.props.responsible; // target date
        newNote.props.date = iObeyaNodeToClone.props.date; // undisplayed label "workload".
        newNote.props.workload = iObeyaNodeToClone.props.workload;
        newNote.props.layoutId = iObeyaNodeToClone.props.layoutId;
    }

    //pour la card
    if (iObeyaNodeToClone['@class'] === "com.iobeya.dto.BoardCardDTO") {
        newNote.assignees = iObeyaNodeToClone.assignees;
        newNote.checklist = iObeyaNodeToClone.checklist;
        newNote.entityType = iObeyaNodeToClone.entityType;
        newNote.displayTimestamp = iObeyaNodeToClone.displayTimestamp;
        newNote.props.description = iObeyaNodeToClone.props.description;
        newNote.props.endDate = iObeyaNodeToClone.props.endDate;
        newNote.props.metric = iObeyaNodeToClone.props.metric;
        newNote.props.priority = iObeyaNodeToClone.props.priority;
    }

    // on récupère les informations depuis l'escallation sticker (si pas présent on ne fait rien)
    // idéalement ce travail devrait être fait en amont de cet appel
    var iObeyaOverlapping = findOverlappingElements(iObeyaNodeToClone, iObeyaConnectedPlatform.iObeyaNodes);
    var escallationSticker = getAssociatedEscallationSticker(iObeyaOverlapping);
    if (escallationSticker === undefined || escallationSticker === null) {
        console.log(" createClonedNote : le sticker d'escallade n'est pas présent");
        return null; // on n'a pas d'infos pour faire l'escallade, on sort...
    }
    //  valeurs obligatoires
    var l_targetrollname = ESCALLATION_MAPPING.map[escallationSticker.name].target_dropZone; // Zone d'atterrissage cible
    l_targetrollname = (l_targetrollname == undefined || l_targetrollname == null) ? DROP_ZONE : l_targetrollname; // pour eviter une erreur si pb de conf
    var l_target_boardname = ESCALLATION_MAPPING.map[escallationSticker.name].target_board; // l'id de la board (pas celui du container )    // on récupère le nom de la board cible. ( elle peut être en dehors des boards ou room gérés)
    l_target_boardname = (l_target_boardname == undefined || l_target_boardname == null) ? iObeyaNodeToClone.boardname : l_target_boardname; // pour eviter une erreur si pb de conf

    // valeurs facultatives
    var l_target_url = ESCALLATION_MAPPING.map[escallationSticker.name].target_url; // l'url de la plateforme cible
    l_target_url = (l_target_url == undefined || l_target_url == null) ? iObeyaConnectedPlatform.IOBEYAURL : l_target_url;
    var l_target_roomname = ESCALLATION_MAPPING.map[escallationSticker.name].target_room; // le nom de la room cible

    targetiObeyaConnectedPlatform = targetiObeyaConnectedPlatform[l_target_url]; // on récupère l'array de la target board

    var l_target_roomid = null;
    //on recherche le nom/id de la room au sein de la plateforme cible.
    for (var iii in targetiObeyaConnectedPlatform.rooms)
        if (targetiObeyaConnectedPlatform.rooms[iii].name.toLowerCase() === l_target_roomname.toLowerCase()) {
            l_target_roomid = targetiObeyaConnectedPlatform.rooms[iii].id;
            break;
        }

    // si l'on n'a pas trouvé la room cible on sort
    if (l_target_roomid == null) {
        console.log(" createClonedNote : la room n'existe pas dans la plateforme target");
        return null; // on n'a pas d'infos pour faire l'escallade, on sort...
    }

    var l_target_boardid = getBoardidFromName(targetiObeyaConnectedPlatform, l_target_boardname, targetiObeyaConnectedPlatform.roomallboards); // on récupère l'id du board. ( elle peut être en dehors des boards ou room gérés)
    var l_target_roomid = (l_target_roomid == undefined || l_target_roomid == null) ? iObeyaConnectedPlatform.activeRoom.id : l_target_roomid; //on prend le board active

    //Ces  propriétés ne sont pas standard dans iObeya mais nous les utilisons pour la logique du code et la mise au point du code
    newNote.boardname = l_target_boardname;
    newNote.boardid = l_target_boardid;
    newNote.status = l_targetrollname;
    newNote.roomname = l_target_roomname;
    newNote.roomid = l_target_roomid;
    newNote.target_url = l_target_url;

    // on créé un objet rida temporaire pour permettre de réutiliser la fonction getBoardElementContainerFromBoardName
    newNote.container = getBoardElementContainerFromBoardName(targetiObeyaConnectedPlatform, l_target_boardname);

    // il faut que l'on determine où l'on place la nouvelle note dans le panneau cible.
    // on commence par récupérer les élément "collés" sur la note.

    var overlappingElements = findOverlappingElements(newNote, iObeyaConnectedPlatform.iObeyaNodes);
    var targetoverlappingElements = [];
    for (var ii in overlappingElements) {  // on clone les overlapping éléments utiles. TODO: pour le deboggage/test on clone tout, à modifier.
        if (
                isEscallation(overlappingElements[ii]) ||
                isActorLabel(overlappingElements[ii]) ||
                isPercentCompleteSticker(overlappingElements[ii]) ||
                isPrioritySticker(overlappingElements[ii])
                )
            targetoverlappingElements.push(overlappingElements[ii]); // pour l'instant on clone tout.
    }

    var l_boardid = iObeyaNodeToClone.boardid;
    var roll = findRollbyLabelName(targetiObeyaConnectedPlatform.iObeyaNodes, newNote.status, l_boardid);
    newNote = placeElement(roll, newNote, targetiObeyaConnectedPlatform.iObeyaNodes, targetoverlappingElements);

    var elementsToCreate = [];
    elementsToCreate.push(newNote);
    if (targetoverlappingElements)
        elementsToCreate = elementsToCreate.concat(targetoverlappingElements);

    var creationHelper = {
        newNote: newNote,
        roll: roll,
        iObeyaNodes: targetiObeyaConnectedPlatform.iObeyaNodes,
        elementsToCreate: elementsToCreate
    };
    return creationHelper;
}

/***
 * Mise à jour d'un post-it dans l'objet iObeya
 **/
/*
 *
 * @param {type} iObeyaConnectedPlatform : le contexte de connexion à la plateforme iObeya
 * @param {type} ridaObj
 * @param {type} iObeyaObj
 * @param {type} iObeyaOverlapping
 * @returns {Array|updateNoteIniObeya.elementsToUpdate}
 *
 */

function updateNoteIniObeya(iObeyaConnectedPlatform, ridaObj, iObeyaObj, iObeyaOverlapping) {
    try {
        console.log("Mise à jour d'un post-it dans iObeya");

        // Note: les infos d'url/room/board sont déjà placés. dans l'objets iObeyaObj

        var iObeyaNodes = iObeyaConnectedPlatform.iObeyaNodes;

        // on récupère le panneau depuis le RIDA (/!\ il peut avoir changé)
        var l_boardid = getBoardidFromRidaObj(iObeyaConnectedPlatform, ridaObj);        //
        // Mise à jour des champs de la NOTE
        // On met à jour le contenu de la note ( par les attributs ex: container, etc...)

        iObeyaObj['@class'] = "com.iobeya.dto.BoardNoteDTO";
        if ((ridaObj.description || ridaObj.details)) {

            if (ridaObj.description)
                if (ridaObj.description.length)
                    iObeyaObj['@class'] = "com.iobeya.dto.BoardCardDTO";

            if (ridaObj.details)
                if (ridaObj.details.length)
                    iObeyaObj['@class'] = "com.iobeya.dto.BoardCardDTO";
        }

        var note = fillNoteForiObeya(iObeyaObj, ridaObj);
        //
        // Mise à jour (en mémoire) des éléments au dessus de la note : pourcentage, priorite, acteurs
        // iObeyaOverlapping est un array() créé via findOverlappingElements( ); créée dans la fonction précédente
        var label = manageLabelUpdate(iObeyaConnectedPlatform, ridaObj, note, iObeyaOverlapping);
        var percentSticker = managePercentCompleteStickerUpdate(iObeyaConnectedPlatform, ridaObj, note, iObeyaOverlapping);
        var prioritySticker = managePriorityStickerUpdate(iObeyaConnectedPlatform, ridaObj, note, iObeyaOverlapping);

        // Il est possible à ce stade que des nouveaux éléments supperposés aient été créés, il faut revérifier la liste
        iObeyaOverlapping = findOverlappingElements(iObeyaObj, iObeyaNodes);

        // On gère s'il y a changement de status RIDA (donc de roll) et on modifie la position de la  note dans le kanban.
        var iObeyaStatusObj = findNoteStatus(iObeyaObj, iObeyaNodes); //état courant de la note

        iObeyaObj.status = ridaObj.status; // pour un deboggage plus facile

        if (ridaObj.status !== iObeyaStatusObj.status) {   // status de l'objet a changé    ?
            var roll = findRollbyLabelName(iObeyaConnectedPlatform.iObeyaNodes, ridaObj.status, l_boardid); // le nouveau roll du status
            // Récupérer tous les éléments qui chevauchent le post-it
            note = placeElement(roll, note, iObeyaNodes, iObeyaOverlapping);
        }

        // Creation de l'arrayUpdate
        var elementsToUpdate = [];
        elementsToUpdate.push(note);   // on ajoute la note à la liste des "elementsToUpdate" (l'update des objets iObeya est traité en fin de processus de synchro)
        elementsToUpdate = elementsToUpdate.concat(iObeyaOverlapping); // on ajoute les éléments supperposés

        return elementsToUpdate;
    } catch (e) {
        throw e;
    }
}

/*** Détermination de l'action à effectuer sur une étiquette "Ressource" (création, modification, suppression) ***/
function manageLabelUpdate(iObeyaConnectedPlatform, ridaObj, note, overlappingElements) {

    var iObeyaNodes = iObeyaConnectedPlatform.iObeyaNodes;
    var label = getAssociatedLabel(overlappingElements);

    // 1er cas : suppression de l'étiquette du responsable
    if (ridaObj.actor == null && label != null) {
        removeiObeyaElement(iObeyaConnectedPlatform, label.id); // la suppression est immédiate, appel de l'url de suppression
        removeNodeFromiObeyaNodes(label, iObeyaNodes);
        label = null;

    } else { // 2e cas : création de l'étiquette du responsable
        if (ridaObj.actor && label == null) {
            label = createActorLabel(iObeyaConnectedPlatform, ridaObj);
            iObeyaNodes.push(label);
            label = placeLabel(label, note);// Coordonnées de l'étiquette
        }
        if (ridaObj.actor && label && ridaObj.actor != label.contentLabel) {
            label = updateActorLabel(iObeyaConnectedPlatform, label, ridaObj);
        }
    }
    return label;
}

/*** Détermination de l'action à effectuer sur un sticker "% achevé" (création, modification, suppression) ***/
function managePercentCompleteStickerUpdate(iObeyaConnectedPlatform, ridaObj, note, overlappingElements) {
    var iObeyaNodes = iObeyaConnectedPlatform.iObeyaNodes;
    var stickerMapping = PERCENTAGE_IOBEYASTICKER_MAPPING;
    var percentSticker = getAssociatedPercentCompleteSticker(overlappingElements);

    if (ridaObj.percentComplete == null && percentSticker != null) {
        // 1er cas : suppression
        removeiObeyaElement(iObeyaConnectedPlatform, percentSticker.id);// la suppression est immédiate, appel de l'url de suppression
        removeNodeFromiObeyaNodes(percentSticker, iObeyaNodes);
        percentSticker = null;
    } else if (ridaObj.percentComplete != null && percentSticker == null) {
        // 2e cas : création
        percentSticker = createSticker(iObeyaConnectedPlatform, ridaObj, ridaObj.percentComplete, stickerMapping);
        iObeyaNodes.push(percentSticker);
        percentSticker = placePercentCompleteSticker(percentSticker, note);  // placé sur la note
    } else if (ridaObj.percentComplete != null && percentSticker != null && percentSticker.name != PERCENTAGE_IOBEYASTICKER_MAPPING.map[ridaObj.percentComplete].name) {
        // 3e cas : mise à jour
        percentSticker = updateSticker(iObeyaConnectedPlatform, percentSticker, ridaObj, ridaObj.percentComplete, stickerMapping);
    } else {
        return null;
    }
    return percentSticker;
}

/*** Détermination de l'action à effectuer sur un sticker "Priorité" (création, modification, suppression) ***/
/*
 *
 * @param {type} iObeyaConnectedPlatform
 * @param {type} ridaObj
 * @param {type} note
 * @param {type} overlappingElements
 * @returns {createSticker.newSticker|managePriorityStickerUpdate.prioritySticker|updateSticker.sticker}
 *
 */

function managePriorityStickerUpdate(iObeyaConnectedPlatform, ridaObj, note, overlappingElements) {

    var iObeyaNodes = iObeyaConnectedPlatform.iObeyaNodes;

    var stickerMapping = PRIORITY_IOBEYASTICKER_MAPPING;
    var prioritySticker = getAssociatedPrioritySticker(overlappingElements);
    if (ridaObj.priority == null && prioritySticker != null) {
        // 1er cas : suppression
        removeiObeyaElement(iObeyaConnectedPlatform, prioritySticker.id); // la suppression est immédiate, appel de l'url de suppression
        removeNodeFromiObeyaNodes(prioritySticker, iObeyaNodes);
        prioritySticker = null;
    } else if (ridaObj.priority != null && prioritySticker == null) {
        // 2e cas : création
        prioritySticker = createSticker(iObeyaConnectedPlatform, ridaObj, ridaObj.priority, stickerMapping);
        iObeyaNodes.push(prioritySticker);
        prioritySticker = placePrioritySticker(prioritySticker, note); // placé sur la note
    } else if (ridaObj.priority != null && prioritySticker != null && prioritySticker.name != PRIORITY_IOBEYASTICKER_MAPPING.map[ridaObj.priority].name) {
        // 3e cas : mise à jour
        prioritySticker = updateSticker(iObeyaConnectedPlatform, prioritySticker, ridaObj, ridaObj.priority, stickerMapping);
    } else {
        return null;
    }

    return prioritySticker;
}

/***
 Remplissage des propriétés d'un post-it dans iObeya
 Cette méthode ne s'occupe que des propriétés visible.
 Cette méthode pourrait évoluer pour l'objet de type "CardId" en v3.4
 ***/

function fillNoteForiObeya(note, ridaObj) {
    // Vérification des informations à récupérer
    if (!ridaObj.hasOwnProperty("modificationDate"))
        throw new InterfaceException("Le champ \"modificationDate\" ne figure pas dans la liste des champs RIDA à synchroniser.");
    if (!ridaObj.hasOwnProperty("creator"))
        throw new InterfaceException("Le champ \"creator\" ne figure pas dans la liste des champs RIDA à synchroniser.");
    if (!ridaObj.hasOwnProperty("modifier"))
        throw new InterfaceException("Le champ \"modifier\" ne figure pas dans la liste des champs RIDA à synchroniser.");

    // on traite les données

    try {
        note.props = {}; // on initialise l'object

        if (note['@class'] === "com.iobeya.dto.BoardNoteDTO") {  //pour la note
            note.props.content = ""; // content( old content)
            note.props.label0 = ""; // due date (old title)
            note.props.label2 = ""; // target date (old responsible)
            note.props.label1 = ""; // undisplayed label "workload". ( old date)
            note.props.label3 = ""; // pour le cas où on utilise une note à 5 champs
            note.props.workload = "";
            note.props.layoutId = NOTE_DEFAULT_LAYOUTID;
            note.entityType = "BoardNote";
            note.assignees = [];
            note.checklist = [];
            note.name = "Note";
        }

        if (note['@class'] === "com.iobeya.dto.BoardCardDTO") { 	//pour la card
            note.assignees = [];
            note.checklist = [];
            note.entityType = "BoardCard";
            //newNote.displayTimestamp=false;
            note.props.description = "";
            note.props.endDate = null;
            note.props.metric = "";
            note.props.priority = "";
            note.boardId = note.boardid;
            note.boardName = note.boardname;
            note.roomName = note.roomname;
            note.name = "Carte";
        }

        if (ridaObj.creator != null)
            note.creator = ridaObj.creator;
        note.creationDate = ridaObj.creationDate;

        // Traitement du statut (statut par défaut)
        if (!ridaObj.status) // Si bug: avant:  if(ridaObj.status == null)
            ridaObj.status = DROP_ZONE;

        note.status = ridaObj.status; // pour un deboggage & logique plus facile

        // Récupération de la date de modification
        var updateDate = ridaObj.modificationDate;
        if (!updateDate)  // Si bug: avant:  if(update == null)
            updateDate = new Date().getTime();
        note.modificationDate = updateDate;

        /* New Method for version 3.3 for iObeya*/
        if (ridaObj.modifier !== null)
            note.modifier = ridaObj.modifier;

        //if (note['@class'] === "com.iobeya.dto.BoardNoteDTO" )
        //if (note['@class'] === "com.iobeya.dto.BoardCardDTO" )
        /* New properties for version 3.3 for iObeya*/
        mapRidaToIObeya(ridaObj, note);

        //Si c'est une card
        if (note['@class'] === "com.iobeya.dto.BoardCardDTO") {
            var dobreak = true;
            note.height = CARD_DEFAULT_HEIGHT;
            note.width = CARD_DEFAULT_WIDTH;

            if (ridaObj.firmDeadline)
                note.color = CARD_WARNING_COLOR;
            else if (note.color === CARD_WARNING_COLOR && !ridaObj.firmDeadline)
                note.color = CARD_DEFAULT_COLOR;

            // on traite les details du RIDA, il faut construire un array.
            var buff = ridaObj.details; // on récupère les données

            var checklisttext = "";
            var checklisttextsplit = "";
            var checklistflag = false;


            if (buff)
                if (buff.length) {
                    note.checklist = new Array(); // array vide

                    checklisttextsplit = buff.split(/<\/span>|<br>/); // il faut splitter les lignes selon les <br> </span>
                    for (var iii = 0; iii < checklisttextsplit.length; iii++) {

                        var checklistobject = {};// array vide	
                        checklisttext = parseNoteText(checklisttextsplit[iii]).replace(/\n|\r/g, '');
                        // si la ligne est barré -> items checké

                        // on prépare l'array
                        if (checklisttext.length) {
                            if (checklisttextsplit[iii].indexOf('<span') >= 0 && checklisttextsplit[iii].indexOf('line-through') >= 0)
                                checklistflag = true;
                            else
                                checklistflag = false;
                            checklistobject['@class'] = "com.iobeya.dto.ChecklistItemDTO";
                            checklistobject.isReadOnly = false;
                            checklistobject.index = iii + 1;
                            checklistobject.status = checklistflag;
                            checklistobject.label = checklisttext;
                            checklistobject.parentId = note.id;
                            checklistobject.entityType = "ChecklistItem";
                            note.checklist.push(checklistobject);
                        }

                    } // for iii
                }	// if buff.length
        }

        //Si c'est une note
        if (note['@class'] === "com.iobeya.dto.BoardNoteDTO") {
            // Traitement de la couleur
            if (ridaObj.firmDeadline)
                // Echéance ferme : post-it rouge
                note.color = NOTE_WARNING_COLOR;
            else if (note.color === NOTE_WARNING_COLOR && !ridaObj.firmDeadline)
                // Cette tâche n'a plus d'échéance ferme : post-it jaune
                note.color = NOTE_DEFAULT_COLOR;

            // Post-it
            note.height = NOTE_DEFAULT_HEIGHT;
            note.width = NOTE_DEFAULT_WIDTH;
        }

        return note;
    } catch (e) {
        throw e;
    }
}

/***
 * Convertit un objet RIDA en noeud iObeya, en fonction du mapping défini globalement
 * (IOBEYANOTE_MAPPING)
 * @param ridaObj : Object objet RIDA
 * @param iObeyaNote : Object iObeya sur lequel sont reportée les propriétés de l'objet RIDA
 */

function mapRidaToIObeya(ridaObj, iObeyaNote) {

    // Parcours de tous les champs du mapping
    for (var key in IOBEYANOTE_MAPPING) {

        // 'mapingItem' = 'content'|'title'|'responsible'|...
        var mappingItem = IOBEYANOTE_MAPPING[key];

        // Vérification de la présence des champs nécessaires
        if (!mappingItem.hasOwnProperty("type")) {
            // throw new InterfaceException("L'objet '"+key+"' de transformation de RIDA vers iObeya ne possède pas de champ \'type\'");
            console.info("L'objet '" + key + "' de transformation de iObeya vers RIDA ne possède pas de champ 'type'. C'est peut-être normal.");
            continue;
        }
        if (!mappingItem.hasOwnProperty("rida_field")) {
            // throw new InterfaceException("L'objet '"+key+"' de transformation de RIDA vers iObeya ne possède pas de champ \'rida_field\'");
            console.info("L'objet '" + key + "' de transformation de iObeya vers RIDA ne possède pas de champ 'rida_field'. C'est peut-être normal.");
            continue;
        }

        // on filtre par type de propriété sur la valeur applyto qui correspond au type
        // si ce n'est le bon type on passe.

        if (mappingItem.class !== iObeyaNote['@class'])
            continue;

        // Initialisation à partir du template iObeya
        var type = mappingItem.type;
        var rida_field = mappingItem.rida_field;
        var emptyString = "";
        if (mappingItem.emptyString)
            emptyString = mappingItem.emptyString;
        var data = "";
        var cntconcat = 0;

        // Si valeur RIDA est définie, on la traite
        if (ridaObj[rida_field] || rida_field.constructor === Array) {
            // En fonction du type de traitement voulu pour le champ de la note
            switch (type) {
                // Mapping simple 1 -> 1
                case "text":
                    data = parseNoteText(ridaObj[rida_field]);
                    break;

                    // Mapping complexe, * -> 1
                case "concat":
                    if (rida_field.constructor === Array) {
                        // Définition de la chaine de séparation des champs
                        var concatString = ":";
                        if (mappingItem.hasOwnProperty("concatString"))
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
                case "numeric":
                    data = ridaObj[rida_field].toString().replace(".", ",");
                    // Si une string à ajouter a été définie :
                    if (mappingItem.hasOwnProperty("unit"))
                        data = data.concat(mappingItem.unit);
                    break;

                    // Mapping de date : 1 -> 1 ; avec formatage en JJ/MM/YYYY
                case "date":
                    data = new Date(ridaObj[rida_field]).format(DATE_FORMAT);
                    break;

                    // pour la card, il faut pouvoir passer la date en format unix directement	
                case "datepassthrough":
                    if (ridaObj[rida_field]) {
                        data = ridaObj[rida_field];
                    }
                    break;
                case "boolean":
                    if (ridaObj[rida_field] == true || ridaObj[rida_field] == "true" || ridaObj[rida_field] == "1" || ridaObj[rida_field] == 1) {
                        data = true;
                    } else {
                        data = false;
                    }
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
            // TODO + FIXME : lors de la création d'une note la propriété peut ne pas exister car,
            // par exemple, props peux être absent...
            var debug = true;
        }
    }
}

/**
 * Retourne un booléen si l'objet iObeyaObject a besoin d'être cloné/'escallated' ou non.
 * 'Non', si il l'a déjà été ou s'il n'a pas de sticker associé
 * @param iObeyaObject: object iObeya à tester
 * @param iObeyaNodes: ensemble des noeuds iObeya
 * @returns {boolean}
 *
 *
 // On regarde si la note dispose d'un sticker "escallade".
 // on retourne "true" pour indiquer qu'une escallade est nécessaire
 // on test si le label contient la chaine de caractère définie dans ESCALLATION_MAPPING.setName
 // note il faut peux être différentier les notes lambda des notes escalladées. ( le lien commence par le mapname )
 */

function needEscallation(iObeyaObject, iObeyaNodes) {
    var escallation = false;
    // Parmis les éléments qui recouvrent la note, ...
    var iObeyaOverlapping = findOverlappingElements(iObeyaObject, iObeyaNodes);
    // ... on regarde si on a un sticker d'escalade dessus
    var escallationSticker = getAssociatedEscallationSticker(iObeyaOverlapping);


    if (escallationSticker)
        if (iObeyaObject.hasOwnProperty("linkLabel"))
            if (iObeyaObject.linkLabel == null) {
                return true;
            }
    return false;
}

/*** Création d'une étiquette "Responsable" dans iObeya (initialisation) ***/
/*
 *
 * @param {type} iObeyaConnectedPlatform
 * @param {type} ridaObj
 * @returns {createActorLabel.newLabel}
 *
 */

function createActorLabel(iObeyaConnectedPlatform, ridaObj) {
    try {
        var l_boardid = getBoardidFromRidaObj(iObeyaConnectedPlatform, ridaObj);

        var newLabel = {};
        newLabel = fillActorLabel(newLabel, ridaObj);
        newLabel['@class'] = "com.iobeya.dto.BoardLabelDTO";
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
        newLabel.container = getBoardElementContainerFromBoardName(iObeyaConnectedPlatform, ridaObj.PanneauiObeya);
        newLabel.boardid = l_boardid;
        //Permet de récupérer le nom du tableau pour l'objet à créer

        newLabel.boardid = l_boardid; // cette propriété n'est pas standard dans iObeya mais nous l'utilisons au cas où.
        newLabel.boardname = getBoardNameFromRidaObj(iObeyaConnectedPlatform, ridaObj);

        return newLabel;
    } catch (e) {
        throw e;
    }
}

/*** Mise à jour d'une étiquette "Responsable" dans iObeya (initialisation) ***/
/*
 *
 * @param {type} iObeyaConnectedPlatform
 * @param {type} label
 * @param {type} ridaObj
 * @returns {updateActorLabel.label}
 *
 */

function updateActorLabel(iObeyaConnectedPlatform, label, ridaObj) {
    try {
        label = fillActorLabel(label, ridaObj);

        var l_boardid = getBoardidFromRidaObj(iObeyaConnectedPlatform, ridaObj); // on met à jour le boardid au cas où il a changé
        label.container = getBoardElementContainerFromBoardName(iObeyaConnectedPlatform, ridaObj.PanneauiObeya);
        label.boardid = l_boardid;
        label.boardname = getBoardNameFromRidaObj(iObeyaConnectedPlatform, ridaObj);

        return label;
    } catch (e) {
        throw e;
    }
}

/*** Remplissage des propriétés d'une étiquette "Responsable" dans iObeya ***/
/*
 *
 * @param {type} label
 * @param {type} ridaObj
 * @returns {unresolved}
 *
 */

function fillActorLabel(label, ridaObj) {
    try {
        if (ridaObj.actor.hasOwnProperty("length")) { // on vérifie au cas où...
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
    } catch (e) {
        throw e;
    }
}

/*** Création d'un sticker dans iObeya (initialisation) ***/
/*
 *
 * @param {type} iObeyaConnectedPlatform
 * @param {type} ridaObj
 * @param {type} value
 * @param {type} stickerMapping
 * @returns {createSticker.newSticker}
 *
 */

function createSticker(iObeyaConnectedPlatform, ridaObj, value, stickerMapping) {
    try {
        var l_boardid = getBoardidFromRidaObj(iObeyaConnectedPlatform, ridaObj);
        // TODO: comment out
        //var rand = Math.floor(Math.random() * 100);
        var newSticker = {};
        newSticker = fillSticker(newSticker, ridaObj, value, stickerMapping);
        newSticker['@class'] = "com.iobeya.dto.BoardStickerDTO";
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
        newSticker.container = getBoardElementContainerFromBoardName(iObeyaConnectedPlatform, ridaObj.PanneauiObeya);
        newSticker.boardid = l_boardid;
        newSticker.boardname = getBoardNameFromRidaObj(iObeyaConnectedPlatform, ridaObj);
        return newSticker;
    } catch (e) {
        throw e;
    }
}

/*** Mise à jour d'un sticker dans iObeya (initialisation) ***/
/*
 *
 * @param {type} iObeyaConnectedPlatform
 * @param {type} sticker
 * @param {type} ridaObj
 * @param {type} value
 * @param {type} stickerMapping
 * @returns {updateSticker.sticker}
 *
 */

function updateSticker(iObeyaConnectedPlatform, sticker, ridaObj, value, stickerMapping) {
    try {
        sticker = fillSticker(sticker, ridaObj, value, stickerMapping);

        var l_boardid = getBoardidFromRidaObj(iObeyaConnectedPlatform, ridaObj); // on met à jour le boardid au cas où il a changé
        sticker.container = getBoardElementContainerFromBoardName(iObeyaConnectedPlatform, ridaObj.PanneauiObeya);
        sticker.boardid = l_boardid;
        sticker.boardname = getBoardNameFromRidaObj(iObeyaConnectedPlatform, ridaObj);

        return sticker;
    } catch (e) {
        throw e;
    }
}

/*** Remplissage des propriétés d'un sticker dans iObeya ***/
/*
 *
 * @param {type} sticker
 * @param {type} ridaObj
 * @param {type} value
 * @param {type} stickerMapping
 * @returns {unresolved}
 *
 */

function fillSticker(sticker, ridaObj, value, stickerMapping) {
    try {
        if (stickerMapping.map[value].id == null) {
            throw new InterfaceException("Le sticker associé à la valeur \"" + value + "\" n'existe pas dans la boîte à outils iObeya.");
        }

        sticker.name = stickerMapping.map[value].name;
        sticker.setName = stickerMapping.setName;

        sticker.stickerImage = {
            "@class": "com.iobeya.dto.EntityReferenceDTO",
            "id": stickerMapping.map[value].id,
            "type": "com.iobeya.dto.AssetDTO"
        };


        if (ridaObj.modifier != null)
            sticker.modifier = ridaObj.modifier;
        if (ridaObj.modificationDate != null)
            sticker.modificationDate = ridaObj.modificationDate;

        return sticker;
    } catch (e) {
        throw e;
    }
}

/**
 * HELPERS HELPERS, Manipulation des objets de l'interface
 */

/*** Retourne la tâche de synchronisation demandée ***/

function addSyncObject(synclist, action, idRida, idiObeya, status, targetiObeyaUrlplatform, targetiObeyaBoard, targetiObeyaDropZone) {
    var syncObject = {};
    syncObject.action = action;
    syncObject.idRida = idRida;
    syncObject.idiObeya = idiObeya;
    syncObject.status = status;
    syncObject.escallted = false;
    syncObject.boardchaanged = false;
    syncObject.duedateupdated = false;
    if (targetiObeyaUrlplatform !== undefined)
        syncObject.target_url = targetiObeyaUrlplatform; // permet d'indiquer la ptf de destination, si vide c'est la ptf par défaut. (optionnel)
    if (targetiObeyaBoard !== undefined)
        syncObject.target_board = targetiObeyaBoard; // permet d'indiquer la board de destination (obligatoire si escallade)
    if (targetiObeyaDropZone !== undefined)
        syncObject.target_board = targetiObeyaDropZone; // (optionnel?)
    synclist.push(syncObject);
    return synclist;
}

/*** Retourne l'objet iObeya possédant l'id iObeya renseigné ***/

function getiObeyaObjectById(iObeyaNodes, id) {
    try {
        for (var i = 0; i < iObeyaNodes.length; i++) {
            if (iObeyaNodes[i].id == id) {
                return iObeyaNodes[i];
            }
        }
        return null;
    } catch (e) {
        throw e;
    }
}



/*** Retourne l'objet RIDA possédant l'id iObeya renseigné ***/
function getRidaObjectByiObeyaId(nodesRida, id) {
    try {
        for (var i = 0; i < nodesRida.length; i++) {
            if (nodesRida[i].idiObeya === id) {
                return nodesRida[i];
            }
        }
    } catch (e) {
        throw e;
    }
    return null;
}


/*** Retourne l'Index de l'array de l'objet iObeya possédant l'id  renseigné ***/

function getiObeyaIndexObjectById(iObeyaNodes, id) {
    try {
        for (var iiii = 0; iiii < iObeyaNodes.length; iiii++)
            if (iObeyaNodes[iiii].id == id)
                return iiii;

    } catch (e) {
        throw e;
    }
    return null;
}

/*** Retourne l'ID dans l'array de l'objet RIDA possédant l'id RIDA renseigné ***/
function getRidaObjectByRidaId(nodesRida, id) {
    try {
        for (var i = 0; i < nodesRida.length; i++) {
            if (nodesRida[i].idRida == undefined) {
                throw new InterfaceException("Le champ \"idRida\" ne figure pas dans la liste des champs RIDA à synchroniser.");
            }
            if (nodesRida[i].idRida === id) {
                return nodesRida[i];
            }
        }
    } catch (e) {
        throw e;
    }
    return null;
}

/*** Retourne l'id count de l'object RIDA possédant l'id RIDA renseigné ***/
function getRidaIdNumByRidaId(nodesRida, id) {
    try {
        for (var i = 0; i < nodesRida.length; i++) {
            if (nodesRida[i].idRida == undefined) {
                throw new InterfaceException("Le champ \"idRida\" ne figure pas dans la liste des champs RIDA à synchroniser.");
            }
            if (nodesRida[i].idRida === id) {
                return i;
            }
        }
    } catch (e) {
        throw e;
    }
    return null;
}

/**
 
 
 /*** Permet de récupérer des attributs d'une board selon l'objet RIDA précisé et place la valeur par défaut le cas échéant***/
/*
 *
 * @param {type} iObeyaConnectedPlatform
 * @param {type} ridaObj
 * @returns {unresolved}
 *
 */

function getBoardidFromRidaObj(iObeyaConnectedPlatform, ridaObj) {
    if (ridaObj.PanneauiObeya != null)
        for (var i in iObeyaConnectedPlatform.boards) { // on scanne la liste globale de node board
            if (iObeyaConnectedPlatform.boards[i].name.toLowerCase() === ridaObj.PanneauiObeya.toLowerCase())
                return iObeyaConnectedPlatform.boards[i].id;
        }

    // le panneau n'est pas précisé dans l'object RIDA ou n'a pas été trouvé
    // utilisation de la valeur par défaut. (sur le premier panneaux du paramétrage)
    // TODO : essayer d'enveler la variable defaultboard_index
    console.log("Warning :  la valeur du panneau de l'entrée RIDA :" + ridaObj.props.title + " est vide, utilisation du panneau par défaut : " + iObeyaConnectedPlatform.boards[iObeyaConnectedPlatform.defaultboard_index].name);
    return iObeyaConnectedPlatform.boards[iObeyaConnectedPlatform.defaultboard_index].id;  // valeur par défaut.
}


// le flag getBoardidFromAllRoomBoards indique si la recherche de la board id est sur toute les board de la room (,,true) ou seulement sur les boards qui sont sélectionnés dans le fichier de conférence.

function getBoardidFromName(iObeyaConnectedPlatform, name, getBoardidFromAllRoomBoards) {

    if (getBoardidFromAllRoomBoards) {
        if (name != null) {
            for (var i in iObeyaConnectedPlatform.roomallboards) { // on scanne la liste globale de node board
                if (iObeyaConnectedPlatform.roomallboards[i].name.toLowerCase() === name.toLowerCase())
                    return iObeyaConnectedPlatform.roomallboards[i].id;
            }
        }
        return 0;  //pas trouvé.

    } else {
        if (name != null) {
            for (var i in iObeyaConnectedPlatform.boards) { // on scanne la liste globale de node board
                if (iObeyaConnectedPlatform.boards[i].name.toLowerCase() === name.toLowerCase())
                    return iObeyaConnectedPlatform.boards[i].id;
            }
        }
        // le panneau n'est pas précisé dans l'object RIDA ou n'a pas été trouvé
        console.log("Warning :  la valeur du panneau de l'entrée RIDA :" + ridaObj.props.title + " est vide, utilisation du panneau par défaut : " + iObeyaConnectedPlatform.boards[iObeyaConnectedPlatform.defaultboard_index].name);
        return iObeyaConnectedPlatform.boards[iObeyaConnectedPlatform.defaultboard_index].id;  // valeur par défaut.
    }
}

//

function getBoardNameFromRidaObj(iObeyaConnectedPlatform, ridaObj) {
    if (ridaObj.PanneauiObeya != null)
        for (var i in iObeyaConnectedPlatform.boards) { // on scanne la liste globale de node board
            if (iObeyaConnectedPlatform.boards[i].name.toLowerCase() === ridaObj.PanneauiObeya.toLowerCase())
                return iObeyaConnectedPlatform.boards[i].name;
        }
    // le panneau n'est pas précisé dans l'object RIDA ou n'a pas été trouvé
    // utilisation de la valeur par défaut. (sur le premier panneaux du paramétrage)
    console.log("Warning :  la valeur du panneau de l'entrée RIDA :" + ridaObj.props.title + " est vide, utilisation du panneau par défaut : " + iObeyaConnectedPlatform.boards[iObeyaConnectedPlatform.defaultboard_index].name);
    return iObeyaConnectedPlatform.boards[iObeyaConnectedPlatform.defaultboard_index].name;  // valeur par défaut.
}


//TODO: finir d'écrire la fonction.

function getBoardElementContainerFromBoardName(iObeyaConnectedPlatform, panneauiObeya) {
    if (panneauiObeya != null && panneauiObeya != undefined)
        for (var i in iObeyaConnectedPlatform.boards) { // on scanne la liste globale de node board
            if (iObeyaConnectedPlatform.boards[i].name.toLowerCase() === panneauiObeya.toLowerCase())
                return iObeyaConnectedPlatform.boards[i].elementContainer;
        }

    // le panneau n'est pas précisé dans l'object RIDA ou n'a pas été trouvé
    // utilisation de la valeur par défaut. (sur le premier panneaux du paramétrage)
    console.log("Warning : getBoardElementContainerFromBoardName n'a pas trouvé le board recherché :" + panneauiObeya);
    return iObeyaConnectedPlatform.boards[iObeyaConnectedPlatform.defaultboard_index].elementContainer;  // valeur par défaut.
}

// Calcule l'URL de la board de destination dans le cas d'une escallade.
// il est assumé que précédemment la connection avec la plateforme cible de l'escallade a été établie

function getEscallationTargetBoardUrl(iObeyaConnectedPlatform, iObeyaObject) {

    // Parmi les éléments qui recouvrent la note, ...
    var iObeyaOverlapping = findOverlappingElements(iObeyaObject, iObeyaConnectedPlatform.iObeyaNodes);
    // On trouve le sticker d'escalade qui est dessus
    var escallationSticker = getAssociatedEscallationSticker(iObeyaOverlapping);
    // On récupère le nom du sticker d'escallation
    var escallationtargetname = escallationSticker.name;

    if (iObeyaConnectedPlatform.ESCALLATION_MAPPING.map[escallationtargetname] === undefined) {
        throw new InterfaceException("Pastille d'escalade inconnue." +
                "\n - Note source : " + iObeyaObject.props.content +
                "\n - Rouleau : " + iObeyaConnectedPlatform.DROP_ZONE +
                "\n - Panneau : " + iObeyaObject.boardname +
                "\n - Salle iObeya : " + iObeyaObject.roomname +
                "\nVérifier le fichier de configuration.");
    }

    // lookup dans le fichier de conf pour determiner l'url de la plateforme à laquelle ce nom de board correspond
    if (iObeyaConnectedPlatform.ESCALLATION_MAPPING.map[escallationtargetname].hasOwnProperty("target_url")) {
        var target_url = iObeyaConnectedPlatform.ESCALLATION_MAPPING.map[escallationtargetname].target_url;
    } else {
        target_url = iObeyaConnectedPlatform.IOBEYAURL;// Si l'url n'est pas définie, par défaut on utilise celle de la platforme courante
    }

    var parent = iObeyaConnectedPlatform.parent;

    // on regarde s'il y a une entrée dans l'array des plateformes
    if (!(parent.hasOwnProperty(target_url) && parent[target_url].connected))
        // On retourne null dans l'url, comme cela le reste du code peut indiquer que le lien d'escallade n'est pas fait et recommencer à la prochaine synchro.
        return null;

    // on recupère les paramètres destination
    var target_boardname = iObeyaConnectedPlatform.ESCALLATION_MAPPING.map[escallationtargetname].target_board;

    if (!target_boardname) { // pas possible de proposer une alternative
        throw new InterfaceException("Vérifier configuration de escallation ESCALLATION_MAPPING, *target_board* absent de la configuration. " + " targetname demandé : " + escallationtargetname);
    }

    if (!(iObeyaConnectedPlatform.BOARDSTOSYNC.indexOf(target_boardname) > -1)) {
        throw new InterfaceException("Erreur lors du l'escalade de la note \"" + iObeyaObject.props.content + "\". Le " +
                "panneau cible \"" + target_boardname + "\" absent de la liste BOARDSTOSYNC.\nVérifier le fichier de configuration.");
    }

    return parent[target_url].IOBEYAURL + IOBEYA_URL_PATH_1 + parent[target_url].client_version + IOBEYA_URL_PATH_2 + getBoardidFromName(iObeyaConnectedPlatform, target_boardname, false);
}

// Calcule le label du lien de destination dans le cas d'une escallade.
// il est assumé que précédemment la connection avec la plateforme cible de l'escallade a été établie

function getEscallationTargetBoardLabel(iObeyaConnectedPlatform, iObeyaObject) {

    // Parmi les éléments qui recouvrent la note, ...
    var iObeyaOverlapping = findOverlappingElements(iObeyaObject, iObeyaConnectedPlatform.iObeyaNodes);
    // On trouve le sticker d'escalade qui est dessus
    var escallationSticker = getAssociatedEscallationSticker(iObeyaOverlapping);

    // On récupère le nom du sticker d'escallation
    var escallationtargetname = escallationSticker.name;

    // lookup dans le fichier de conf pour determiner l'url de la plateforme à laquelle ce nom de board correspond
    if (iObeyaConnectedPlatform.ESCALLATION_MAPPING.map[escallationtargetname].hasOwnProperty("target_url")) {
        var target_url = iObeyaConnectedPlatform.ESCALLATION_MAPPING.map[escallationtargetname].target_url;
    } else {
        // Si l'url n'est pas définie, par défaut on utilise celle de la platforme courante
        target_url = iObeyaConnectedPlatform.IOBEYAURL;
    }

    var parent = iObeyaConnectedPlatform.parent;

    // on regarde s'il y a une entrée dans l'array des plateformes
    if (parent.hasOwnProperty(target_url)) {
        // on recupère les paramètres destination
        var target_boardname = iObeyaConnectedPlatform.ESCALLATION_MAPPING.map[escallationtargetname].target_board;

        if (!target_boardname) {
            throw new InterfaceException("Vérifier configuration de escallation ESCALLATION_MAPPING," +
                    "target_board absent de la configuration  : " + " targetname :" + escallationtargetname);
        }

        return iObeyaConnectedPlatform.ESCALLATION_MAPPING.setName + ":board:" + target_boardname;

    } else
        /**
         * On retourne null dans l'url, comme cela le reste du code peut indiquer que le lien d'escallade n'est pas
         * fait et recommencer à la prochaine synchro.
         */
        return null;
}

/**
 * Calcule l'URL de la board courante de l'object passé.
 * Typiquement permet de placer un lien vers le board quelque part.
 * @param iObeyaConnectedPlatform
 * @param iObeyaObject
 * @returns {string}
 */
function getObjectCurrentBoardUrl(iObeyaConnectedPlatform, iObeyaObject) {

    return iObeyaConnectedPlatform.IOBEYAURL
            + "/s/download/resources/client-html-plugin/"
            + iObeyaConnectedPlatform.client_version
            + "/public/#/fr/board/" + iObeyaObject.boardid;
}

/**
 * Calcule le label courant de l'object passé.
 * Typiquement permet de placer un lien vers le board quelque part.
 * @param iObeyaConnectedPlatform
 * @param iObeyaObject
 * @returns {string}
 */
function getObjectCurrentBoardLabel(iObeyaConnectedPlatform, iObeyaObject) {
    return iObeyaConnectedPlatform.ESCALLATION_MAPPING.setName + ":source:" + iObeyaObject.boardname;
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
 * @returns iObeyaProperty Object: Pointeur vers le sous-ensemble de l'objet iObeya qui contient
 * la propriété 'propertyName'
 */
function getiObeyaPropertyObject(iObeyaObj, propertyName) {
    var iObeyaProperty = iObeyaObj;
    // Stocke le chemin remonté dans le mapping depuis 'propertyName'
    var chain = [];
    // Noeud courant
    var node = propertyName;

    try {
        // On construit le chemin qui mène à la racine, tant que node.iobeya_parent est défini
        while (node
                && IOBEYANOTE_MAPPING.hasOwnProperty(node)
                && IOBEYANOTE_MAPPING[node].iobeya_parent // équivaut à != ['' | null | undefined ] (au moins)
                ) {
            // On remplace le noeud par son parent
            node = IOBEYANOTE_MAPPING[node].iobeya_parent;
            chain.push(node); // Sauvegarde du chemin parcouru
        }
        // On a le chemin, on descend de la racine de l'objet iObeya jusqu'à la feuille
        while (chain.length > 0) {
            iObeyaProperty = iObeyaProperty[chain.pop()];
        }
    } catch (e) {
        var interfaceE = new InterfaceException("Propriété '" + node + "' non trouvée dans l'objet iObeya fourni.");
        interfaceE.parentException = e; // FIXME: non standard
        throw interfaceE;
    }
    return iObeyaProperty;
}

/*** Manipulation de d'array ***/
/*
 *
 * @param {type} elt
 * @param {type} iObeyaNodes
 * @returns {undefined}
 *
 */
function removeNodeFromiObeyaNodes(elt, iObeyaNodes) {
    for (var i = 0; i < iObeyaNodes.length; i++) {
        if (iObeyaNodes[i] === elt) {
            iObeyaNodes.splice(i, 1);
        }
    }
}

function onQueryFailed2(sender, args) {
    var msg = "Request failed. " + args.get_message() + "\n" + args.get_stackTrace();
    alert(msg);
    console.log(msg);
    // Réactivation du bouton
    g_lockSync = false;
    window.location.reload(); // rafraichi la page après l'erreur
}

/***
 Succès d'une mise à jour RIDA
 On affiche à l'utilisation les stats sur le resultat de la synchro
 C'est la dernière fonction appelée quand la synchro a réussi
 ***/
/*
 *
 * @param {type} iObeyaConnectedPlatform
 * @returns {undefined}
 *
 */

/*** Nombre d'opérations effectuées ***/
/*
 * @param {type} array
 * @returns {Array}
 *
 */
function getStats(array) {

    var stats = Array();
    stats[syncType.todo_nothing] = 0;
    stats[syncType.todo_createiObeya] = 0;
    stats[syncType.todo_createRida] = 0;
    stats[syncType.todo_synciObeya] = 0;
    stats[syncType.todo_syncRida] = 0;
    stats[syncType.todo_removeiObeya] = 0;
    stats[syncType.todo_removeRida] = 0;
    stats[syncType.todo_moveBoardiObeya] = 0;
    stats[syncType.todo_cloneiObeya] = 0;
    for (var i = 0; i < array.length; i++) {
        stats[array[i].action]++;
    }
    return stats;
}

