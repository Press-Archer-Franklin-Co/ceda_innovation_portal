from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler


def api_success(*, data=None, message="Success", status_code=status.HTTP_200_OK):
    return Response({"success": True, "message": message, "data": data}, status=status_code)


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return response
    detail = response.data
    response.data = {
        "success": False,
        "message": "Request failed.",
        "errors": detail,
    }
    return response
