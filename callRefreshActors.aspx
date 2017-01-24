<%@ Page language="C#" %>
<%@ Register Tagprefix="SharePoint" 
     Namespace="Microsoft.SharePoint.WebControls" 
     Assembly="Microsoft.SharePoint, Version=14.0.0.0, Culture=neutral, PublicKeyToken=71e9bce111e9429c" %>
<%@ Import Namespace="Microsoft.SharePoint" %>
<html dir="ltr" xmlns="http://www.w3.org/1999/xhtml">

<head runat="server">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
	<title>Refresh Actors List</title>
	<meta http-equiv="X-UA-Compatible" content="IE=10" />
	<SharePoint:CssRegistration Name="default" runat="server"/>
	
	<script type="text/javascript" src="../_layouts/15/init.js"></script>
	<script type="text/javascript" src="../_layouts/15/MicrosoftAjax.js"></script>
	
	
	<script type="text/javascript" src="../_layouts/15/SP.Runtime.js"></script>
	<script type="text/javascript" src="../_layouts/15/SP.js"></script>
	<script type="text/javascript" src="../_layouts/15/SP.Taxonomy.js"></script>
    
    <script type="text/javascript" src="jquery-2.1.4.js"></script>
	<script type="text/javascript" src="interfaceConfig.js"></script>
	<script type="text/javascript" src="interfaceUtils.js"></script>
	<script type="text/javascript" src="interfaceGeometryRules.js"></script>
	<script type="text/javascript" src="interfaceiObeyaRules.js"></script>
	<script type="text/javascript" src="interfaceSynciObeya.js"></script>
	<script type="text/javascript" src="interfaceRefreshActors.js"></script>
	<script type="text/javascript" src="interfaceCRUD.js"></script>

	<script type="text/javascript">
		
		$(document).ready(function(){   
			//on s'assure d'avoir loadé toutes les librairies nécessaires

			// Récupération de la liste des acteurs ( taxonomie sharepoint)
			// execute des queries sharepoints asysnchrones, compliqué à gérer
			
			retrieveActorsList_refresh();

		});
	</script>
</head>

<body>
	<form runat="server">
        <SharePoint:FormDigest ID="FormDigest1" runat="server"></SharePoint:FormDigest>
    </form>

	Rafraîchissement en cours, veuillez patienter...
	
</body>

</html>