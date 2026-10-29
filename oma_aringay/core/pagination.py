from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """The default page of every list (10 rows). A client that needs more at once, such as Print Report, which prints every row a
    table's filters match, asks with ?page_size= (at most 200); everything else is unchanged."""
    page_size_query_param = 'page_size'
    max_page_size = 200
