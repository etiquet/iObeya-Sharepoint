/*** Récupère les données Sharepoint ***/

function retrieveRidaListItems(iObeyaConnectedPlatform) {
    var  camlQuery,collListItem,oList;

	try {
	    oList  = iObeyaConnectedPlatform.clientContext.get_web().get_lists().getByTitle(LISTSHAREPOINT_TITLE);
	    camlQuery = new SP.CamlQuery();
	    camlQuery.set_viewXml("<View />");
	    collListItem = oList.getItems(camlQuery);
	    iObeyaConnectedPlatform.clientContext.load(collListItem);
	    iObeyaConnectedPlatform.clientContext.executeQueryAsync(
			Function.createDelegate(this, function(sender, args){
					onSharepointRidaListLoadSucceed(sender, args,collListItem,iObeyaConnectedPlatform);
									} ),
			Function.createDelegate(this, this.onQueryFailed)
			);

	} catch (e) {
		throw new InterfaceException("retrieveRidaListItems :"+e.message);
    }
}

/*** Récupère un champ RIDA et formatte le contenu pour créer un array en mémoire ***/
// TODO: card:vérifier les champs de type text et advanced text.
//vérifier les champs modifié / crée pa

function formateFieldToExport(field) {
    try {

        if (field instanceof Date) { 	// type date
            return field.getTime();
        }

        var data;

        if (field instanceof Array) { 	//  type champs multivalué
            for (arr in field) {
                if (field[arr] instanceof SP.FieldLookupValue) { // cas acteur utilisant une liste
                    data = field[arr].get_lookupValue();
                    return data; // TODO / NOTE : pour l'instant on ne gère que la première valeur du champs. Si c'est multi évalué tant pis....
                }
                if (field[arr] instanceof SP.Taxonomy.TaxonomyFieldValue) { // cas acteur utilisant un array de taxonomie
                    data = field[arr].get_label();
                    return data; // TODO / NOTE : pour l'instant on ne gère que la première valeur du champs.
                }
            }
            return "";
        }

        if (field instanceof SP.FieldLookupValue) { // ex: Champs acteurs simple liste liée
            return field.get_lookupValue();
        }

        if (field instanceof SP.Taxonomy.TaxonomyFieldValue) { // ex Champs simple acteur taxonomie
            return field.get_label();
        }

        if (field instanceof SP.FieldUserValue) { 	//  type de donnée non traitée
            if (field.hasOwnProperty("$5g_1")) // propriété contenant le nom de l'utilisateur 
                return field["$5g_1"];
            else
                return "/!\\type non traite";
        }

        var debug = true; // pour faire un beakpoint
        return field; // par defaut on transmet la valeur (on garde le type d'objet fourni)

    } catch (e) {
        var msg = "Erreur lors du formatage du champ " + field + ".";
        alert(msg);
        console.log(msg);
    }
}

/***
 Succès de la récupération des données Sharepoint : stockage dans l'array ridaNodes
 Cette fonction est une fonction "classique" de sharepoint en cas de succès
 C'est la fonction qui récupère la liste sharepoint
 ***/

// TODO: à vérifier que l'on a bien les paramètres passés....

function onSharepointRidaListLoadSucceed(sender, args, collListItem, iObeyaConnectedPlatform) {
    var fields, l_ridaobj, listItemEnumerator, key;
    l_ridaNodes = [];

    try {
        console.log("Retrieve RIDA items");
        console.log(collListItem);

        listItemEnumerator = collListItem.getEnumerator();

        while (listItemEnumerator.moveNext()) {
            fields = listItemEnumerator.get_current().get_fieldValues();
            l_ridaobj = new Object();
            l_ridaobj.idRida = fields.ID;
            for (key in SHAREPOINTLIST_MATCHINGNAME) { // SHAREPOINTLIST_MATCHINGNAME defined in interfaceConfig.js
                l_ridaobj[key] = formateFieldToExport(fields[SHAREPOINTLIST_MATCHINGNAME[key]]);
            }

            // si la donnée panneau est vide on force la valeur par défaut
            // et si le panneau précisé est en dehors des noms connu => valeur par défaut également

            var found = false;
            for (var i in iObeyaConnectedPlatform.BOARDSTOSYNC) {
                if (l_ridaobj.hasOwnProperty("PanneauiObeya"))
                    if (l_ridaobj.PanneauiObeya == iObeyaConnectedPlatform.BOARDSTOSYNC[i])
                        found = true;
            }

            if (!found) {
                l_ridaobj.PanneauiObeya = iObeyaConnectedPlatform.BOARDSTOSYNC[0];
                console.log("La valeur *panneau* est mal configuré dans l'entrée RIDA :" + l_ridaobj.subject
                        + "\n. Panneau par défaut positionné." + iObeyaConnectedPlatform.BOARDSTOSYNC[0]); // TODO ==> cela implique que le cas ou le panneau est mal positionné dans une entrée n'existe potiellement pas, on doit pouvoir nettoyer l'usage de "defaultboard_index"....
            }
            iObeyaConnectedPlatform.ridaNodes.push(l_ridaobj); // on ajoute l'entrée dans l'array
        }

        // Initialisation de la connexion sur iObeya
        // vérification qu'il n'a pas déjà eu un appel dans le passé ou qu'une autre synchro est en cours...

        if (iObeyaConnectedPlatform.synclist instanceof Array)
            if (iObeyaConnectedPlatform.synclist.length > 1) {
                throw new InterfaceException("Une autre instance est déjà en cours sur votre navigateur Exiting...\n syncList!=0 ");
            }

        // on appelle la fonction de login iObeya ( le context inclu les fonctions de calllbacks, typiquement *syncnote(xxx)* )
        if (g_notificationID)
            g_notificationID.close(SP.UI.DialogResult.OK);
        varTitle = "Préparation de la synchronisation...";
        varMsg = g_versionscript + "Connexion à IObeya...";
        g_notificationID = SP.UI.ModalDialog.showWaitScreenWithNoClose(varTitle, varMsg, 120, 700);
        iObeyaPlatformLoginAndGetItems(iObeyaConnectedPlatform);

    } catch (e) {
        var msg = "Une erreur est survenue à la lecture de la liste sharepoint : \n\n"
                + e.message
                + "\n\npossiblement une des propriétés de la liste \"SHAREPOINTLIST_MATCHINGNAME\" n'a pas été trouvée parmi les colonnes de la table RIDA. Vérifiez le fichier de configuration \n ";
        alert(msg);
        console.log(msg);
        ErrorLogingReloadPage();
    }
}

/***

 Récupération de la liste des acteurs de la banque de termes SharePoint
 TODO: déplacer dans un autre fichier.

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
/*
 *
 * @param {type} iObeyaPlatformDataArray
 * @returns {undefined}
 *
 */

function retrieveActorsList_sync(iObeyaPlatformDataArray) {
    if (g_notificationID)
        g_notificationID.close(SP.UI.DialogResult.OK);
    varTitle = "Préparation de la synchronisation...";
    varMsg = g_versionscript + "Récupération de la liste des acteurs...";
    g_notificationID = SP.UI.ModalDialog.showWaitScreenWithNoClose(varTitle, varMsg, 120, 700);
    
    if (window.hasOwnProperty('ACTORLIST_TITLE')) // si l'on a paramétrer le nom d'une liste on utilise cette liste.
        retrieveActorsList_sync_splist(iObeyaPlatformDataArray);
    else
        retrieveActorsList_sync_taxonomy(iObeyaPlatformDataArray); // sinon on utilise la taxonomie des terms acteurs
} // fin retrieveActorsList_sync

// function gerant la liste d'acteurs utilisant une liste sharepoint dédiée
/*
 *
 * @param {type} iObeyaPlatformDataArray
 * @returns {undefined}
 *
 */

function retrieveActorsList_sync_splist(iObeyaPlatformDataArray) {
    var clientContext = iObeyaPlatformDataArray.clientContext;
    try {
        // fresh variable from actor liste
        var l_oList = clientContext.get_web().get_lists().getByTitle(ACTORLIST_TITLE);
        var l_camlQuery = new SP.CamlQuery();
        l_camlQuery.set_viewXml("<View />");
        var l_collListItem2 = l_oList.getItems(l_camlQuery);
        clientContext.load(l_collListItem2);
        clientContext.executeQueryAsync(Function.createDelegate(this,
            function(sender, args){ onGetQuerySucceededActorslist(sender, args,l_collListItem2); } ),
            Function.createDelegate(this, this.onQueryFailed));
    } catch (e) {
        throw new InterfaceException("Les données de la liste d'acteurs \"" + ACTORLIST_TITLE + "\" n'ont pas pu être trouvées dans Sharepoint");
    }
}

// fonction async de complétion la requête sharepoint.
/*
 *
 * @param {type} sender
 * @param {type} args
 * @param {type} l_collListItem2
 * @returns {undefined}
 *
 */

function onGetQuerySucceededActorslist(sender, args,l_collListItem2) {
    var fields, l_ridaobj, listItemEnumerator, key, actorname, actorID, content = {};
    g_actorsTermsList = []; // vider le tableau d'objet ( on déréférence l'ancienne valeur )
    g_actorsTermsListTable = []; // la liste d'array d'acteurs par panneau

    try {
        console.log("Retrieve Actors sharepoint list items");
        console.log(l_collListItem2);

        // initialise la liste des arrays d'acteurs
        for (var panneau in BOARDSTOSYNC)
            g_actorsTermsListTable[BOARDSTOSYNC[panneau]] = [];
        // on récupère la liste d'acteur
        listItemEnumerator = l_collListItem2.getEnumerator();

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
            }
            if (panneauactor) {	// on ajoute l'entrée aux listes dédiées par panneau
                for (var panneau in g_actorsTermsListTable) {
                    if (panneauactor.toLocaleLowerCase() === panneau.toLocaleLowerCase()) // s'il n'est pas dans la liste on ne le traite pas
                        g_actorsTermsListTable[panneau].push(actorname);
                }
            }
        } // while
    } catch (e) {
        throw new InterfaceException("Une erreur est survenue à la lecture de la liste acteurs sharepoint : " + e.message
                + "possiblement une des propriétés de la liste \"ACTORLIST_MATCHINGNAME\" n'a pas été trouvée."
                + "\n vérifiez à tout hasard le fichier de configuration interfaceConfig.js ou votre liste sharepoint \n ");
    }
    console.log("recupéré la liste des acteurs via une liste SP ");
}

// function récupérant les acteurs depuis la taxonomie
/*
 *
 * @returns {undefined}
 *
 */

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
/*
 *
 *
 */
function verifieActorsList_sync() {
    if (!g_actorsTermsList.length) {
        if (confirm("La liste des acteurs (c'est un pb) récupérée est vide, souhaitez-vous tenter de la recharger ?")) {
            retrieveActorsList_sync();
            if (!g_actorsTermsList.length) { // toujours vide pb...
                if (confirm("Impossible de recharger la liste, pb de chargement asynchrone, arrêter ?")) {
                    return false; // on ne traite pas
                }
            }
        } else {
            return false; // on ne traite pas
        }
    }
    return true;
}
