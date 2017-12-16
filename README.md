# iObeya-Sharepoint

Interface permettant de gerer la synchro entre une liste Sharepoint et un ou plusieurs panneau iObeya.
Evolution significative: multihomming des paramètres.

Log des modifications de l’interface iObeya Sharepoint

- Toutes les fonctions XTMLREQUEST sont asynchrones
- peut gérer la liste d'acteur soit dans une taxonomie soit (nouveau) dans une liste secondaire.
- le code a été refactorisé pour permettre un déboggage plus facile (suppression de la function displayexception qui masquait le throw d’erreur )
- le code est « mutihoming », permet de gérer plusieurs instance.  ( nécessite un timer asysnchrone)
    - Ca fenêtre sharepoint sert de lookup du paramètre à charger
- Le mapping des champs des notes avec une liste est configurable avec 4 types de données
	- text
	- concat ( concaténation / split d’une zone )
	- numeric
	- date
- Si un post-it est en dehors d’une zone kanban le status est positionné à vierge (ex post-it de légende )
- Si  type de contenu text la longueur sera tronquée à 255 (avec alerte) et les retour chariots sont supprimés ;


Procédure accélérée pour création d’une nouvelle configuration

1/ Créer une liste sharepoint pour iObeya selon les colonnes standards.
	le plus simple est de réaliser cette action à partir d’un modèle

2/ Définir le mode de gestion des acteurs, taxonomie ou autre liste sharepoint

3/ Si liste sharepoint d’acteur réutiliser la même liste ou créer en une à partir d’un modèle
	pensez à paramétrer le nom du ou des panneaux

4/ Paramétrer la nouvelle liste, notamment
	- si acteur dans une liste ou taxonomie ( la mise modèle dispose des deux ) adapter selon votre besoin
	- mettez à jour la liste des statuts de tache selon le nombre de zone de votre kanban
	- mettre à jour la liste des panneaux à synchroniser dans la colonne

5/ Créer votre panneau iObeya Kanban à partir d’un template (attention au nom du panneau il doit être identique dans tous les paramétrages )
	Sachez que si vous utilisez des espaces ou caractères accentués ou spéciaux
	il faudra encoder l’url de rafraichissement avec des %xx ( ex %20 à la place des espaces)
	Le nom du panneau doit être unique dans l’ensemble du paramétrage en vigueur car il sert de clé de recherche

6/ Adapter l’url de la zone de rafraichissement d’acteur
	l’url doit être de la forme : ( la variable boardname précise en URLEncoded le nom du panneau
		https://devptf.sharepoint.com/sites/pfe/JsDocs/callRefreshActors.aspx?boardname=Developpement%20-%20Interne

7/ Modifier le fichier de configuration interfaceConfig.js pour ajouter la nouvelle configuration, 
	Vous pouvez travailler par héritage d’un autre paramètre par exemple: 
	-- debut --

	,/*<- pensez à ajouter une virgule à l’issus du dernier paramètre existant ( c’est une liste javascript , le ‘,’ délimite 2 valeurs)*/
	'third': {
		'inherits': 'default', /* <- hérite du paramétrage 'defaut'*/
		'BOARDSTOSYNC' :  [ // Tableaux de iObeya utilisés
			'Programme - Acceleration' ] , 
		'LISTSHAREPOINT_TITLE' : "Chantier Program Acceleration", // attention aux espaces
		'RIDALIST_URL' : '/sites/pfe/Lists/Chantier Program Acceleration/MyItems.aspx',
	}
	-- fin --
	
7/ Si vous souhaitez mettre en oeuvre la capacité d'escalade de post-it entre 2 panneaux 

	-- debut --
	,/*<- pensez à ajouter une virgule à l’issus du dernier paramètre existant ( c’est une liste javascript , le ‘,’ délimite 2 valeurs)*/
        //important : les noms de board target sont uniques entre les #plateformes connectées
        'ESCALLATION_MAPPING': {
            "setName": "Escallation",
            "map": {
                "Orange": {
                    "target_url" :"https://devptf.iobeya.com",
                    "target_room" : "CAP - SIAé",
                    "target_board" : "SuiviCoproj",
                    "target_dropZone": "Point d'attention"
                },
                "Blue": {
                    "target_url" : "https://devptf.iobeya.com", //ptf @cap en 3.4
                    "target_room" : "CAP - SIAé",
                    "target_board" : "SuiviBSU",
                    "target_dropZone": "Point d'attention"
                }
	    }
        }, // la virgule s'il y a d'autres paramètres en suivant

	-- fin --

8/ Effectuez quelques tests croisés de création de note ou d’entrée RIDA pour vérifier que vos paramètres sont OK.
9/ Fini
